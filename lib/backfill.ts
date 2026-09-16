import { countObservations, readEveryScoredBuy, recordObservations } from "./db/queries";
import { scoreBuysWithData } from "./jobs/scoreWallet";
import { fetchDiscoveryTokens, fetchSmartMoneyBuys, scorableCutoff } from "./nansen/endpoints";
import { distinctEntries } from "./score/events";
import { TOKEN_SCAN_DAYS } from "./score/constants";
import { isSupportedChain } from "./chains";
import { nansenClient, type AppContext } from "./http/context";

export const BACKFILL_REQUEST_BUDGET = 900;

export interface BackfillResult {
  chain: string;
  tokens: string[];
  scanned: string[];
  settledEntries: number;
  written: number;
  requests: number;
  exhausted: boolean;
}

export async function backfill(ctx: AppContext, chain: string, tokens: string[], budget: number): Promise<BackfillResult> {
  const now = ctx.now();
  const runId = `backfill-${now.getTime().toString(36)}`;
  const client = nansenClient(ctx, runId);
  const start = client.requests;
  const spent = () => client.requests - start >= budget;
  const cutoff = scorableCutoff(now);
  const scanned: string[] = [];
  let settledEntries = 0;
  let written = 0;

  for (const token of tokens) {
    if (spent()) break;
    const { buys } = await fetchSmartMoneyBuys(client, chain, token, TOKEN_SCAN_DAYS, now);
    const settled = distinctEntries(buys, Number.MAX_SAFE_INTEGER).filter((b) => b.ts <= cutoff);
    settledEntries += settled.length;
    const { scored } = await scoreBuysWithData(ctx.db, client, chain, settled, now, spent);
    written += await recordObservations(ctx.db, chain, scored, now.toISOString());
    scanned.push(token);
  }

  return { chain, tokens, scanned, settledEntries, written, requests: client.requests - start, exhausted: spent() };
}

export async function handleBackfill(ctx: AppContext, req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { chain?: string; tokens?: string[]; discover?: number; budget?: number; seed?: boolean };
  const chain = body.chain ?? "base";
  if (!isSupportedChain(chain)) return Response.json({ error: `Zatto does not scan ${chain}` }, { status: 400 });
  if (body.seed) {
    const written = await recordObservations(ctx.db, chain, await readEveryScoredBuy(ctx.db, chain), ctx.now().toISOString());
    return Response.json({ chain, seeded: written, total: await countObservations(ctx.db, chain) });
  }
  const budget = Math.min(body.budget ?? BACKFILL_REQUEST_BUDGET, BACKFILL_REQUEST_BUDGET);
  const tokens = body.tokens?.length
    ? body.tokens.map((t) => t.toLowerCase())
    : await fetchDiscoveryTokens(nansenClient(ctx, `discover-${ctx.now().getTime().toString(36)}`), chain, body.discover ?? 24);
  const result = await backfill(ctx, chain, tokens, budget);
  return Response.json({ ...result, total: await countObservations(ctx.db, chain) });
}
