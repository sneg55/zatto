import { getDb } from "@/lib/db/d1";
import { readJob, readScoresForRun, readTokenNames } from "@/lib/db/queries";
import { clusters, pooledRun, sortLeaderboard, tokenBreakdown } from "@/lib/score/perWallet";
import { isSupportedChain } from "@/lib/chains";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ chain: string; run_id: string }> }) {
  const { chain, run_id } = await params;
  if (!isSupportedChain(chain)) return Response.json({ error: "unsupported chain" }, { status: 404 });
  const db = getDb();
  const job = await readJob(db, run_id);
  if (!job || job.chain !== chain) return Response.json({ error: "run not found" }, { status: 404 });

  const rows = sortLeaderboard(await readScoresForRun(db, chain, run_id));
  const tokens = tokenBreakdown(rows);
  const symbols = await readTokenNames(db, chain, tokens.map((t) => t.token));

  return Response.json({
    run: {
      run_id: job.run_id,
      chain: job.chain,
      source: job.source,
      status: job.status,
      started_at: job.started_at,
      finished_at: job.finished_at,
      used_requests: job.used_requests,
      planned_requests: job.planned_requests,
      payment_tx: job.payment_tx,
    },
    pooled: pooledRun(rows),
    forming: JSON.parse(job.forming ?? "[]"),
    clusters: Object.fromEntries(clusters(rows)),
    tokens: tokens.map((t) => ({ ...t, symbol: symbols.get(t.token) ?? null })),
    wallets: rows,
  }, { headers: { "cache-control": "public, max-age=60" } });
}
