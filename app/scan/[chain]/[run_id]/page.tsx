import Link from "next/link";
import { getDb } from "@/lib/db/d1";
import { readJob, readScoresForRun } from "@/lib/db/queries";
import { sortLeaderboard } from "@/lib/score/perWallet";
import { fmtGroup, fmtNum, fmtPct, shortAddr } from "@/lib/format";
import type { Candidate } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";

export default async function ScanRun({ params }: { params: Promise<{ chain: string; run_id: string }> }) {
  const { chain, run_id } = await params;
  const db = getDb();
  const job = await readJob(db, run_id);
  if (!job || job.chain !== chain) return <main><h1>Run not found</h1></main>;
  const rows = sortLeaderboard(await readScoresForRun(db, chain, run_id));
  const candidates = JSON.parse(job.candidates) as Candidate[];
  const dropped = candidates.filter((c) => c.dropped);
  return (
    <main>
      <h1>{chain} Smart Money crowding, run {run_id}</h1>
      <p>Source: {job.source}{job.payment_tx ? <> (refreshed by a paid request, <a href={`https://basescan.org/tx/${job.payment_tx}`}>settlement tx</a>)</> : null}. Status: {job.status}. Started {job.started_at ?? "not yet"}, finished {job.finished_at ?? "not yet"}. Requests used {job.used_requests} of {job.planned_requests} planned. Wallets scored {rows.length} of {candidates.length - dropped.length}.</p>
      {job.status === "failed" ? <p>Failed: {job.error}</p> : null}
      <table>
        <thead><tr><th>Wallet</th><th>Verdict</th><th>New buyers per buy</th><th>Baseline per hour</th><th>Fast arrivals</th><th>Delayed 24h, crowded</th><th>Delayed 24h, quiet</th><th>Usable buys</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.wallet}>
              <td><Link href={`/wallet/${chain}/${r.wallet}?run=${run_id}`}>{shortAddr(r.wallet)}</Link></td>
              <td>{r.verdict}{r.provisional ? " (provisional)" : ""}</td>
              <td>{fmtNum(r.newBuyersPerBuy)}</td><td>{fmtNum(r.baselinePerBuy)}</td>
              <td>{r.fastShare.mean == null ? "n/a" : fmtPct(r.fastShare.mean)} ({r.fastShare.contributing})</td>
              <td>{fmtGroup(r.delayed24h.crowded)}</td><td>{fmtGroup(r.delayed24h.uncrowded)}</td>
              <td>{r.n} ({r.tokens} tokens)</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dropped.length ? <p>Not scored under the request cap: {dropped.map((c) => `${shortAddr(c.wallet)} (${c.dropped})`).join(", ")}</p> : null}
    </main>
  );
}
