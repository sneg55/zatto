import { loadBuys, walletFetchedAt } from "./db/queries";
import { fetchWalletBuys } from "./nansen/endpoints";
import { getTape } from "./nansen/tape";
import { hourKey } from "./score/perBuy";
import { MAX_BUYS_PER_WALLET } from "./score/constants";
import { nansenClient, type AppContext } from "./http/context";

export async function handleRecent(ctx: AppContext, chain: string, addr: string): Promise<Response> {
  const wallet = addr.toLowerCase();
  if (chain !== "base" || !/^0x[0-9a-f]{40}$/.test(wallet)) return Response.json({ error: "unknown chain or malformed address" }, { status: 400 });
  const now = ctx.now();
  const client = nansenClient(ctx, null);
  const last = await walletFetchedAt(ctx.db, chain, wallet);
  const buys = last && now.getTime() - new Date(last).getTime() < 600_000 ? await loadBuys(ctx.db, chain, wallet, MAX_BUYS_PER_WALLET) : await fetchWalletBuys(client, ctx.db, chain, wallet, now);
  const newest = [...buys].sort((a, b) => b.ts.localeCompare(a.ts) || a.tx.localeCompare(b.tx))[0];
  if (!newest) return Response.json({ newest: null, buyers: [], status: "none" });
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
  return Response.json({ newest, buyers, status: buckets.every((b) => b.final) ? "final" : "provisional" });
}
