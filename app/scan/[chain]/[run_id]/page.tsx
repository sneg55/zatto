import Link from "next/link";
import { getDb } from "@/lib/db/d1";
import { readJob, readScoresForRun } from "@/lib/db/queries";
import { sortLeaderboard } from "@/lib/score/perWallet";
import { fmtNum, fmtPct, shortAddr } from "@/lib/format";
import type { Candidate } from "@/lib/jobs/types";
import { VerdictTag, StatusTag } from "@/app/_components/Tag";
import { GroupDelta } from "@/app/_components/Delta";

export const dynamic = "force-dynamic";

export default async function ScanRun({ params }: { params: Promise<{ chain: string; run_id: string }> }) {
  const { chain, run_id } = await params;
  const db = getDb();
  const job = await readJob(db, run_id);
  if (!job || job.chain !== chain) {
    return (
      <main>
        <div className="empty-state">
          <p className="eyebrow">Not found</p>
          <h1>Run not found</h1>
          <p>There is no scan run {run_id} on {chain}.</p>
        </div>
      </main>
    );
  }
  const rows = sortLeaderboard(await readScoresForRun(db, chain, run_id));
  const candidates = JSON.parse(job.candidates) as Candidate[];
  const dropped = candidates.filter((c) => c.dropped);

  return (
    <main>
      <p className="eyebrow">{chain} leaderboard</p>
      <h1>Smart Money crowding, run {run_id}</h1>

      <div className="meta-block">
        <div className="meta-item">
          <span className="meta-label">Source</span>
          <span className="meta-value">
            {job.source}
            {job.payment_tx ? (
              <span className="pill-note">
                paid, <a href={`https://basescan.org/tx/${job.payment_tx}`}>settlement tx</a>
              </span>
            ) : null}
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Status</span>
          <span className="meta-value"><StatusTag>{job.status}</StatusTag></span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Started</span>
          <span className="meta-value muted">{job.started_at ?? "not yet"}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Finished</span>
          <span className="meta-value muted">{job.finished_at ?? "not yet"}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Requests used</span>
          <span className="meta-value">{job.used_requests} of {job.planned_requests}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Wallets scored</span>
          <span className="meta-value">{rows.length} of {candidates.length - dropped.length}</span>
        </div>
      </div>

      {job.status === "failed" ? <p>Failed: {job.error}</p> : null}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Verdict</th>
              <th className="num">New buyers per buy</th>
              <th className="num">Baseline per hour</th>
              <th className="num">Fast arrivals</th>
              <th className="num">Delayed 24h, crowded</th>
              <th className="num">Delayed 24h, quiet</th>
              <th className="num">Usable buys</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.wallet} className={r.provisional ? "row-muted" : undefined}>
                <td><Link href={`/wallet/${chain}/${r.wallet}?run=${run_id}`} className="wallet-addr">{shortAddr(r.wallet)}</Link></td>
                <td><VerdictTag verdict={r.verdict} provisional={r.provisional} /></td>
                <td className="num">{fmtNum(r.newBuyersPerBuy)}</td>
                <td className="num">{fmtNum(r.baselinePerBuy)}</td>
                <td className="num">{r.fastShare.mean == null ? "n/a" : fmtPct(r.fastShare.mean)} ({r.fastShare.contributing})</td>
                <td className="num"><GroupDelta group={r.delayed24h.crowded} /></td>
                <td className="num"><GroupDelta group={r.delayed24h.uncrowded} /></td>
                <td className="num">{r.n} ({r.tokens} tokens)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dropped.length ? (
        <p className="foot-note">
          Not scored under the request cap: {dropped.map((c) => `${shortAddr(c.wallet)} (${c.dropped})`).join(", ")}
        </p>
      ) : null}
    </main>
  );
}
