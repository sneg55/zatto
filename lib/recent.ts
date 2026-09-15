import { loadBuys, readTokenNames, walletFetchedAt, walletHasBuys } from "./db/queries";
import { fetchWalletBuys } from "./nansen/endpoints";
import { getTape } from "./nansen/tape";
import { hourKey } from "./score/perBuy";
import { MAX_BUYS_PER_WALLET } from "./score/constants";
import { BUY_LOAD_MULTIPLE, distinctEvents } from "./score/events";
import { isAddress, isSupportedChain } from "./chains";
import { bumpIp, sha256Hex } from "./jobs/leases";
import { LIVE_MAX_THROTTLE_MS } from "./nansen/client";
import { BudgetExhaustedError } from "./nansen/credits";
import { nansenClient, type AppContext } from "./http/context";

export const RECENT_BUYERS_SHOWN = 100;

function newestOf<T extends { ts: string; tx: string }>(buys: T[]): T | undefined {
  return [...buys].sort((a, b) => b.ts.localeCompare(a.ts) || a.tx.localeCompare(b.tx))[0];
}

export async function handleRecent(ctx: AppContext, chain: string, addr: string, ip: string): Promise<Response> {
  const wallet = addr.toLowerCase();
  if (!isSupportedChain(chain)) return Response.json({ error: `Zatto does not scan ${chain}` }, { status: 400 });
  if (!isAddress(wallet)) return Response.json({ error: "that is not a wallet address" }, { status: 400 });
  const now = ctx.now();
  const hits = await bumpIp(ctx.db, await sha256Hex(`recent:${ip}`), now.toISOString().slice(0, 13));
  if (hits > Number(ctx.env.LIVE_WALLET_PER_IP_PER_HOUR)) return Response.json({ newest: null, buyers: [], status: "none", reason: "per-ip limit" }, { status: 429 });
  if (!(await walletHasBuys(ctx.db, chain, wallet))) return Response.json({ newest: null, buyers: [], status: "none", reason: "this wallet has no buys on record, open it from a scan run or refresh its wallet page first" }, { status: 404 });
  const client = nansenClient(ctx, null, LIVE_MAX_THROTTLE_MS);
  try {
    const last = await walletFetchedAt(ctx.db, chain, wallet);
    const buys = last && now.getTime() - new Date(last).getTime() < 600_000 ? distinctEvents(await loadBuys(ctx.db, chain, wallet, MAX_BUYS_PER_WALLET * BUY_LOAD_MULTIPLE), MAX_BUYS_PER_WALLET) : await fetchWalletBuys(client, ctx.db, chain, wallet, now, "recent");
    const newest = newestOf(buys);
    if (!newest) return Response.json({ newest: null, buyers: [], totalBuyers: 0, shown: 0, status: "none" });
    const t0 = new Date(newest.ts).getTime();
    const hours = [hourKey(newest.ts), new Date(t0 + 3_600_000).toISOString().slice(0, 13)];
    const buckets = [];
    for (const h of hours) buckets.push(await getTape(ctx.db, client, chain, newest.token, h, now, "recent"));
    const seen = new Set<string>(); const buyers: Array<{ address: string; secondsAfter: number; usd: number | null; tx: string }> = [];
    for (const b of buckets) for (const r of b.rows) {
      if (r[2] !== "BUY" || r[1] === wallet || seen.has(r[5])) continue;
      const ms = new Date(r[0]).getTime();
      if (ms < t0) continue;
      seen.add(r[5]); buyers.push({ address: r[1], secondsAfter: Math.round((ms - t0) / 1000), usd: r[3], tx: r[5] });
    }
    const symbols = await readTokenNames(ctx.db, chain, [newest.token]);
    buyers.sort((a, b) => a.secondsAfter - b.secondsAfter || a.tx.localeCompare(b.tx));
    return Response.json({
      newest: { ...newest, symbol: symbols.get(newest.token) ?? null },
      buyers: buyers.slice(0, RECENT_BUYERS_SHOWN),
      totalBuyers: buyers.length,
      shown: Math.min(buyers.length, RECENT_BUYERS_SHOWN),
      status: buckets.every((b) => b.final) ? "final" : "provisional",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason = e instanceof BudgetExhaustedError ? "budget exhausted" : /nansen \S+ 429/.test(msg) ? "rate limited" : `recent lookup failed: ${msg.slice(0, 200)}`;
    const fallback = newestOf(distinctEvents(await loadBuys(ctx.db, chain, wallet, MAX_BUYS_PER_WALLET * BUY_LOAD_MULTIPLE), MAX_BUYS_PER_WALLET));
    if (!fallback) return Response.json({ newest: null, buyers: [], totalBuyers: 0, shown: 0, status: "none", stale: true, reason }, { status: 503 });
    return Response.json({ newest: fallback, buyers: [], totalBuyers: 0, shown: 0, status: "provisional", stale: true, reason });
  }
}
