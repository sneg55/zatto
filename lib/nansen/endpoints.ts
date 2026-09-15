import type { NansenClient } from "./client";
import type { D1Like } from "../db/d1";
import type { Buy } from "../score/types";
import { isQualifyingBuy, toBuy, type ProfilerTrade } from "./quote";
import { LOOKBACK_DAYS, MAX_BUYS_PER_WALLET } from "../score/constants";
import { upsertBuys, setWalletFetched } from "../db/queries";

interface Envelope<T> { data: T[]; pagination?: { page: number; per_page: number; is_last_page: boolean } }

export async function fetchScreenerTokens(client: NansenClient, chain: string): Promise<string[]> {
  const { data } = await client.post<Envelope<{ token_address: string }>>("token-screener", {
    chains: [chain], timeframe: "24h",
    filters: { trader_type: "sm", include_stablecoins: false, include_native_tokens: false },
    order_by: [{ field: "buy_volume", direction: "DESC" }], pagination: { page: 1, per_page: 30 },
  });
  return data.data.map((t) => t.token_address.toLowerCase());
}

export interface TgmTrade { block_timestamp: string; transaction_hash: string; trader_address: string; trader_address_label: string | null; action: "BUY" | "SELL"; estimated_swap_price_usd: number | null; estimated_value_usd: number | null }

export async function fetchSmartMoneyBuyers(client: NansenClient, chain: string, token: string, days: number, now: Date): Promise<Array<{ wallet: string; buys: number }>> {
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data } = await client.post<Envelope<TgmTrade>>("tgm/dex-trades", {
    chain, token_address: token, only_smart_money: true, date: { from, to: now.toISOString() },
    filters: { action: "BUY" }, pagination: { page: 1, per_page: 1000 },
  });
  const counts = new Map<string, number>();
  for (const t of data.data) { const w = t.trader_address.toLowerCase(); counts.set(w, (counts.get(w) ?? 0) + 1); }
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

export async function fetchWalletBuys(client: NansenClient, db: D1Like, chain: string, wallet: string, now: Date): Promise<Buy[]> {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data } = await client.post<Envelope<ProfilerTrade>>("profiler/dex-trades", {
    address: wallet, chain, date: { from, to: now.toISOString() },
    order_by: [{ field: "block_timestamp", direction: "DESC" }], pagination: { page: 1, per_page: 100 },
  });
  const buys = data.data.filter((t) => isQualifyingBuy(chain, t)).map((t) => toBuy(chain, wallet, t)).slice(0, MAX_BUYS_PER_WALLET);
  await upsertBuys(db, buys, now.toISOString());
  await setWalletFetched(db, chain, wallet.toLowerCase(), now.toISOString());
  return buys;
}
