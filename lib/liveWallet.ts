import { loadBuys, readScore, walletFetchedAt, writeScore } from "./db/queries";
import { bumpIp, releaseLiveSlot, sha256Hex, takeLiveSlot } from "./jobs/leases";
import { scoreOneWallet } from "./jobs/scoreWallet";
import { fetchWalletBuys, scorableCutoff } from "./nansen/endpoints";
import { BudgetExhaustedError } from "./nansen/credits";
import { MAX_BUYS_PER_WALLET } from "./score/constants";
import { BUY_LOAD_MULTIPLE, distinctEvents } from "./score/events";
import { isAddress, isSupportedChain } from "./chains";
import { LIVE_MAX_THROTTLE_MS } from "./nansen/client";
import { nansenClient, type AppContext } from "./http/context";

export const LIVE_REQUEST_CAP = 120;

export async function handleLiveWallet(ctx: AppContext, chain: string, addr: string, ip: string): Promise<Response> {
  const wallet = addr.toLowerCase();
  if (!isSupportedChain(chain)) return Response.json({ error: `Zatto does not scan ${chain}` }, { status: 400 });
  if (!isAddress(wallet)) return Response.json({ error: "that is not a wallet address" }, { status: 400 });
  const now = ctx.now();
  const cached = await readScore(ctx.db, chain, wallet, null);
  const fresh = cached && now.getTime() - new Date(cached.computedAt).getTime() < 3_600_000;
  if (fresh) return Response.json({ ...cached, stale: false });
  const hour = now.toISOString().slice(0, 13);
  const hits = await bumpIp(ctx.db, await sha256Hex(ip), hour);
  if (hits > Number(ctx.env.LIVE_WALLET_PER_IP_PER_HOUR)) return Response.json({ ...(cached ?? {}), stale: true, reason: "per-ip limit" }, { status: cached ? 200 : 429 });
  const slot = await takeLiveSlot(ctx.db, Number(ctx.env.LIVE_WALLET_CONCURRENCY), now.toISOString(), new Date(now.getTime() + 60_000).toISOString());
  if (!slot) return Response.json({ ...(cached ?? {}), stale: true, reason: "busy" }, { status: cached ? 200 : 503 });
  const runId = `live-${now.getTime().toString(36)}-${wallet.slice(2, 8)}`;
  const client = nansenClient(ctx, runId, LIVE_MAX_THROTTLE_MS);
  try {
    const last = await walletFetchedAt(ctx.db, chain, wallet);
    const buys = last && now.getTime() - new Date(last).getTime() < 600_000
      ? distinctEvents(await loadBuys(ctx.db, chain, wallet, MAX_BUYS_PER_WALLET * BUY_LOAD_MULTIPLE, scorableCutoff(now)), MAX_BUYS_PER_WALLET)
      : await fetchWalletBuys(client, ctx.db, chain, wallet, now);
    const { score, partial } = await scoreOneWallet(ctx.db, client, chain, wallet, buys, now, LIVE_REQUEST_CAP);
    await writeScore(ctx.db, score, runId, now.toISOString());
    return Response.json({ score, runId, computedAt: now.toISOString(), stale: false, partial });
  } catch (e) {
    const reason = e instanceof BudgetExhaustedError ? "daily budget exhausted" : `live scoring failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`;
    return Response.json({ ...(cached ?? {}), stale: true, reason }, { status: cached ? 200 : 503 });
  } finally {
    await releaseLiveSlot(ctx.db, slot);
  }
}
