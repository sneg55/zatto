import type { D1Like } from "../db/d1";
import { loadBuys, walletFetchedAt } from "../db/queries";
import type { NansenClient } from "../nansen/client";
import { fetchDiscoveryTokens, fetchSmartMoneyBuyers, fetchWalletBuys, scorableCutoff } from "../nansen/endpoints";
import { DISCOVERY_TOKENS, MAX_BUYS_PER_WALLET, TOP_WALLETS } from "../score/constants";
import { BUY_LOAD_MULTIPLE, distinctEvents } from "../score/events";
import type { Candidate } from "./types";
import { bucketsFor, countMissingBuckets } from "./scoreWallet";

export const WALLET_BUYS_CACHE_MS = 600_000;
export const SCREENER_REQUESTS = 2;
export const WALLET_FETCH_REQUESTS = 2;

export function planRequestsFor(topWallets: number, discoveryTokens: number): number {
  return SCREENER_REQUESTS + discoveryTokens + topWallets * WALLET_FETCH_REQUESTS;
}

export interface PlanLimits { topWallets: number; planRequests: number; discoveryTokens: number; expired: () => boolean }

export async function planJob(db: D1Like, client: NansenClient, chain: string, now: Date, requestCap: number, limits: Partial<PlanLimits> = {}): Promise<{ candidates: Candidate[]; plannedRequests: number }> {
  const topWallets = limits.topWallets ?? TOP_WALLETS;
  const discoveryTokens = limits.discoveryTokens ?? DISCOVERY_TOKENS;
  const planRequests = limits.planRequests ?? planRequestsFor(topWallets, discoveryTokens);
  const expired = limits.expired ?? (() => false);
  const start = client.requests;
  const spent = () => client.requests - start;
  const tokens = await fetchDiscoveryTokens(client, chain, discoveryTokens);
  const discoveryBudget = spent() + discoveryTokens;
  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (spent() >= discoveryBudget || expired()) break;
    for (const { wallet, buys } of await fetchSmartMoneyBuyers(client, chain, token, 7, now)) {
      counts.set(wallet, (counts.get(wallet) ?? 0) + buys);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topWallets).map(([wallet]) => wallet);
  const candidates: Candidate[] = [];
  for (const wallet of ranked) {
    const last = await walletFetchedAt(db, chain, wallet);
    const cached = last !== null && now.getTime() - new Date(last).getTime() < WALLET_BUYS_CACHE_MS;
    if (!cached && spent() >= planRequests) break;
    const buys = cached
      ? distinctEvents(await loadBuys(db, chain, wallet, MAX_BUYS_PER_WALLET * BUY_LOAD_MULTIPLE, scorableCutoff(now)), MAX_BUYS_PER_WALLET)
      : await fetchWalletBuys(client, db, chain, wallet, now);
    candidates.push({ wallet, buys, buckets: bucketsFor(buys) });
  }
  const missing = new Map<string, number>();
  for (const c of candidates) missing.set(c.wallet, await countMissingBuckets(db, chain, c.buckets));
  const planned = client.requests;
  const plan = () => planned + candidates.filter((c) => !c.dropped).reduce((sum, c) => sum + (missing.get(c.wallet) ?? 0) * 2 + c.buys.length, 0);
  let total = plan();
  while (total > requestCap) {
    const live = candidates.filter((c) => !c.dropped);
    if (live.length === 0) break;
    const heaviest = live.sort((a, b) => (missing.get(b.wallet) ?? 0) - (missing.get(a.wallet) ?? 0))[0];
    heaviest.dropped = `over request cap: needed ${missing.get(heaviest.wallet)} buckets`;
    total = plan();
  }
  return { candidates, plannedRequests: total };
}
