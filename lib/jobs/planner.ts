import type { D1Like } from "../db/d1";
import type { NansenClient } from "../nansen/client";
import { fetchScreenerTokens, fetchSmartMoneyBuyers, fetchWalletBuys } from "../nansen/endpoints";
import type { Candidate } from "./types";
import { bucketsFor, countMissingBuckets } from "./scoreWallet";

export const TOP_WALLETS = 25;

export async function planJob(db: D1Like, client: NansenClient, chain: string, now: Date, requestCap: number, topWallets = TOP_WALLETS): Promise<{ candidates: Candidate[]; plannedRequests: number }> {
  const tokens = await fetchScreenerTokens(client, chain);
  const counts = new Map<string, number>();
  for (const token of tokens) {
    for (const { wallet, buys } of await fetchSmartMoneyBuyers(client, chain, token, 7, now)) {
      counts.set(wallet, (counts.get(wallet) ?? 0) + buys);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topWallets).map(([wallet]) => wallet);
  const candidates: Candidate[] = [];
  for (const wallet of ranked) {
    const buys = await fetchWalletBuys(client, db, chain, wallet, now);
    candidates.push({ wallet, buys, buckets: bucketsFor(buys) });
  }
  const missing = new Map<string, number>();
  for (const c of candidates) missing.set(c.wallet, await countMissingBuckets(db, chain, c.buckets));
  const spent = client.requests;
  const plan = () => spent + candidates.filter((c) => !c.dropped).reduce((sum, c) => sum + (missing.get(c.wallet) ?? 0) * 2 + Math.ceil(new Set(c.buys.map((b) => b.token)).size / 10), 0);
  let planned = plan();
  while (planned > requestCap) {
    const live = candidates.filter((c) => !c.dropped);
    if (live.length === 0) break;
    const heaviest = live.sort((a, b) => (missing.get(b.wallet) ?? 0) - (missing.get(a.wallet) ?? 0))[0];
    heaviest.dropped = `over request cap: needed ${missing.get(heaviest.wallet)} buckets`;
    planned = plan();
  }
  return { candidates, plannedRequests: planned };
}
