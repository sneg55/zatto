import { readTokenNames, readTokenScan, writeTokenScan } from "./db/queries";
import { bumpIp, releaseLiveSlot, sha256Hex, takeLiveSlot } from "./jobs/leases";
import { scoreBuysWithData } from "./jobs/scoreWallet";
import { fetchSmartMoneyBuys, scorableCutoff } from "./nansen/endpoints";
import { getTape } from "./nansen/tape";
import { BudgetExhaustedError } from "./nansen/credits";
import { TOKEN_SCAN_DAYS, TOKEN_SCAN_ENTRIES } from "./score/constants";
import { distinctEntries } from "./score/events";
import { burstHours, scoreBurst } from "./score/perBuy";
import { scoreWallet, tokenBreakdown } from "./score/perWallet";
import type { BurstScore, Buy, TapeBucket, TokenStat } from "./score/types";
import { isAddress, isSupportedChain } from "./chains";
import { LIVE_MAX_THROTTLE_MS } from "./nansen/client";
import { nansenClient, type AppContext } from "./http/context";

export const TOKEN_REQUEST_CAP = 120;
export const TOKEN_SCAN_FRESH_MS = 3_600_000;

export interface TokenScan {
  chain: string;
  token: string;
  symbol: string | null;
  days: number;
  stat: TokenStat | null;
  forming: BurstScore[];
  wallets: string[];
  smartMoneyBuys: number;
  entries: number;
  truncated: boolean;
  window: { from: string; to: string } | null;
  skipped: number;
}

function emptyStat(token: string): TokenStat {
  return { token, buys: 0, events: 0, wallets: 0, crowded: 0, maxBurst: null, medianBurst: null, medianDelayed24h: null, newest: null, verdict: "QUIET", entries: [] };
}

export async function scanToken(ctx: AppContext, client: ReturnType<typeof nansenClient>, chain: string, token: string, now: Date): Promise<TokenScan> {
  const { buys, isLast } = await fetchSmartMoneyBuys(client, chain, token, TOKEN_SCAN_DAYS, now);
  const all = distinctEntries(buys, Number.MAX_SAFE_INTEGER);
  const entries = all.slice(0, TOKEN_SCAN_ENTRIES);
  const cutoff = scorableCutoff(now);
  const settled = entries.filter((b) => b.ts <= cutoff);
  const recent = entries.filter((b) => b.ts > cutoff);

  const start = client.requests;
  const spent = () => client.requests - start >= TOKEN_REQUEST_CAP;
  const scored = await scoreBuysWithData(ctx.db, client, chain, settled, now, spent);

  const walletOf = new Map(settled.map((b) => [`${b.tx}|${b.token}`, b.wallet]));
  const byWallet = new Map<string, typeof scored.scored>();
  for (const s of scored.scored) {
    const wallet = walletOf.get(`${s.tx}|${s.token}`) ?? token;
    byWallet.set(wallet, [...(byWallet.get(wallet) ?? []), s]);
  }
  const walletScores = [...byWallet.entries()].map(([wallet, rows]) => scoreWallet(chain, wallet, rows));
  const stat = tokenBreakdown(walletScores).find((t) => t.token === token) ?? emptyStat(token);

  const forming: BurstScore[] = [];
  for (const buy of recent) {
    if (spent()) break;
    const buckets: TapeBucket[] = [];
    for (const hour of burstHours(buy.ts)) buckets.push(await getTape(ctx.db, client, chain, buy.token, hour, now, "recent"));
    const burst = scoreBurst({ buy, buckets, now });
    if (burst.settled) forming.push(burst);
  }

  const symbols = await readTokenNames(ctx.db, chain, [token]);
  return {
    chain, token, symbol: symbols.get(token) ?? null, days: TOKEN_SCAN_DAYS,
    stat, forming,
    wallets: [...new Set(entries.map((b: Buy) => b.wallet))],
    smartMoneyBuys: buys.length,
    entries: entries.length,
    truncated: !isLast || all.length > entries.length,
    window: entries.length ? { from: entries[entries.length - 1].ts, to: entries[0].ts } : null,
    skipped: scored.skipped,
  };
}

export async function handleLiveToken(ctx: AppContext, chain: string, addr: string, ip: string): Promise<Response> {
  const token = addr.toLowerCase();
  if (!isSupportedChain(chain)) return Response.json({ error: `Zatto does not scan ${chain}` }, { status: 400 });
  if (!isAddress(token)) return Response.json({ error: "that is not a token address" }, { status: 400 });
  const now = ctx.now();
  const cached = await readTokenScan(ctx.db, chain, token);
  if (cached && now.getTime() - new Date(cached.computedAt).getTime() < TOKEN_SCAN_FRESH_MS) {
    return Response.json({ scan: JSON.parse(cached.result) as TokenScan, computedAt: cached.computedAt, stale: false });
  }
  const stale = cached ? { scan: JSON.parse(cached.result) as TokenScan, computedAt: cached.computedAt, stale: true } : { stale: true };
  const hits = await bumpIp(ctx.db, await sha256Hex(`token:${ip}`), now.toISOString().slice(0, 13));
  if (hits > Number(ctx.env.LIVE_WALLET_PER_IP_PER_HOUR)) return Response.json({ ...stale, reason: "per-ip limit" }, { status: cached ? 200 : 429 });
  const slot = await takeLiveSlot(ctx.db, Number(ctx.env.LIVE_WALLET_CONCURRENCY), now.toISOString(), new Date(now.getTime() + 60_000).toISOString());
  if (!slot) return Response.json({ ...stale, reason: "busy" }, { status: cached ? 200 : 503 });
  const runId = `token-${now.getTime().toString(36)}-${token.slice(2, 8)}`;
  try {
    const scan = await scanToken(ctx, nansenClient(ctx, runId, LIVE_MAX_THROTTLE_MS), chain, token, now);
    await writeTokenScan(ctx.db, chain, token, now.toISOString(), scan);
    return Response.json({ scan, computedAt: now.toISOString(), stale: false });
  } catch (e) {
    const reason = e instanceof BudgetExhaustedError ? "daily budget exhausted" : `token scan failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`;
    return Response.json({ ...stale, reason }, { status: cached ? 200 : 503 });
  } finally {
    await releaseLiveSlot(ctx.db, slot);
  }
}
