import type { NansenClient } from "./client";
import type { D1Like } from "../db/d1";
import type { Buy } from "../score/types";
import { isQualifyingBuy, toBuy, type ProfilerTrade } from "./quote";
import { DISCOVERY_TOKENS, FRESH_TOKEN_MAX_AGE_DAYS, LOOKBACK_DAYS, MAX_BUYS_PER_WALLET, SCORABLE_AGE_MINUTES } from "../score/constants";
import { distinctEvents } from "../score/events";
import { upsertBuys, setWalletFetched, upsertTokenNames } from "../db/queries";

interface Envelope<T> { data: T[]; pagination?: { page: number; per_page: number; is_last_page: boolean } }

export type TokenSource = "established" | "fresh";

export async function fetchScreenerTokens(client: NansenClient, chain: string, source: TokenSource = "established"): Promise<string[]> {
  const age = source === "fresh" ? { token_age_days: { min: 0, max: FRESH_TOKEN_MAX_AGE_DAYS } } : {};
  const { data } = await client.post<Envelope<{ token_address: string }>>("token-screener", {
    chains: [chain], timeframe: "24h",
    filters: { trader_type: "sm", include_stablecoins: false, include_native_tokens: false, ...age },
    order_by: [{ field: "buy_volume", direction: "DESC" }], pagination: { page: 1, per_page: 30 },
  });
  return data.data.map((t) => t.token_address.toLowerCase());
}

export function interleave(fresh: string[], established: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < max && (i < fresh.length || i < established.length); i++) {
    for (const token of [fresh[i], established[i]]) {
      if (token === undefined || seen.has(token) || out.length >= max) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

export async function fetchDiscoveryTokens(client: NansenClient, chain: string, max = DISCOVERY_TOKENS): Promise<string[]> {
  const fresh = await fetchScreenerTokens(client, chain, "fresh");
  const established = await fetchScreenerTokens(client, chain, "established");
  return interleave(fresh, established, max);
}

export interface TgmTrade { block_timestamp: string; transaction_hash: string; trader_address: string; trader_address_label: string | null; action: "BUY" | "SELL"; estimated_swap_price_usd: number | null; estimated_value_usd: number | null }

export async function fetchSmartMoneyBuys(client: NansenClient, chain: string, token: string, days: number, now: Date): Promise<{ buys: Buy[]; isLast: boolean }> {
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data } = await client.post<Envelope<TgmTrade>>("tgm/dex-trades", {
    chain, token_address: token, only_smart_money: true, date: { from, to: now.toISOString() },
    filters: { action: "BUY" }, order_by: [{ field: "block_timestamp", direction: "DESC" }],
    pagination: { page: 1, per_page: 1000 },
  });
  return {
    buys: data.data.map((t) => ({
      chain, wallet: t.trader_address.toLowerCase(), token: token.toLowerCase(), tx: t.transaction_hash,
      ts: new Date(t.block_timestamp).toISOString(), usd: t.estimated_value_usd, price: t.estimated_swap_price_usd,
    })),
    isLast: data.pagination?.is_last_page ?? true,
  };
}

export async function fetchSmartMoneyBuyers(client: NansenClient, chain: string, token: string, days: number, now: Date): Promise<Array<{ wallet: string; buys: number }>> {
  const { buys } = await fetchSmartMoneyBuys(client, chain, token, days, now);
  const counts = new Map<string, number>();
  for (const b of buys) counts.set(b.wallet, (counts.get(b.wallet) ?? 0) + 1);
  return [...counts.entries()].map(([wallet, buys]) => ({ wallet, buys }));
}

export async function fetchTapePage(client: NansenClient, chain: string, token: string, hour: string, page: number): Promise<{ rows: TgmTrade[]; isLast: boolean }> {
  const from = `${hour}:00:00.000Z`;
  const to = new Date(new Date(from).getTime() + 3_600_000).toISOString();
  const { data } = await client.post<Envelope<TgmTrade>>("tgm/dex-trades", {
    chain, token_address: token, date: { from, to }, order_by: [{ field: "block_timestamp", direction: "ASC" }], pagination: { page, per_page: 1000 },
  });
  return { rows: data.data, isLast: data.pagination?.is_last_page ?? true };
}

export function scorableCutoff(now: Date): string {
  return new Date(now.getTime() - SCORABLE_AGE_MINUTES * 60_000).toISOString();
}

async function fetchProfilerBuys(client: NansenClient, chain: string, wallet: string, from: string, to: string): Promise<{ buys: Buy[]; names: Array<{ token: string; symbol: string }> }> {
  const { data } = await client.post<Envelope<ProfilerTrade>>("profiler/dex-trades", {
    address: wallet, chain, date: { from, to },
    order_by: [{ field: "block_timestamp", direction: "DESC" }], pagination: { page: 1, per_page: 100 },
  });
  const qualifying = data.data.filter((t) => isQualifyingBuy(chain, t));
  return {
    buys: qualifying.map((t) => toBuy(chain, wallet, t)),
    names: qualifying.map((t) => ({ token: t.token_bought_address.toLowerCase(), symbol: t.token_bought_symbol })),
  };
}

export async function fetchWalletBuys(client: NansenClient, db: D1Like, chain: string, wallet: string, now: Date, purpose: "score" | "recent" = "score"): Promise<Buy[]> {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const cutoff = scorableCutoff(now);
  const scorablePage = await fetchProfilerBuys(client, chain, wallet, from, cutoff);
  const newestPage = await fetchProfilerBuys(client, chain, wallet, from, now.toISOString());
  const scorable = distinctEvents(scorablePage.buys.filter((b) => b.ts <= cutoff), MAX_BUYS_PER_WALLET);
  const newest = distinctEvents(newestPage.buys, MAX_BUYS_PER_WALLET);
  const byTx = new Map(([] as Buy[]).concat(newest, scorable).map((b) => [`${b.tx}|${b.token}`, b]));
  await upsertBuys(db, [...byTx.values()], now.toISOString());
  await upsertTokenNames(db, chain, [...scorablePage.names, ...newestPage.names], now.toISOString());
  await setWalletFetched(db, chain, wallet.toLowerCase(), now.toISOString());
  return purpose === "recent" ? newest : scorable;
}
