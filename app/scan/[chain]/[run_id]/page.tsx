import Link from "next/link";
import { getDb } from "@/lib/db/d1";
import { readJob, readScoresForRun } from "@/lib/db/queries";
import { clusters, pooledRun, sortLeaderboard } from "@/lib/score/perWallet";
import { fmtDateTime, fmtExcluded, fmtNum, fmtPct, fmtRatio, shortAddr } from "@/lib/format";
import type { Candidate } from "@/lib/jobs/types";
import { VerdictTag, StatusTag } from "@/app/_components/Tag";
import { Delta } from "@/app/_components/Delta";
import { CROWD_RATIO } from "@/lib/score/constants";

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
  const pooled = pooledRun(rows);
  const cluster = clusters(rows);
  const candidates = JSON.parse(job.candidates) as Candidate[];
  const dropped = candidates.filter((c) => c.dropped);
  const comparable = !pooled.crowded.insufficient && !pooled.uncrowded.insufficient;

  return (
    <main>
      <div className="page-head">
        <p className="eyebrow">{chain} leaderboard</p>
        <h1>Who gets copied when Smart Money buys</h1>
        <span className="run-id">run {run_id}</span>
      </div>

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
          <span className="meta-value muted">{job.started_at ? fmtDateTime(job.started_at) : "not yet"}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Finished</span>
          <span className="meta-value muted">{job.finished_at ? fmtDateTime(job.finished_at) : "not yet"}</span>
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

      <section className="pooled">
        <h2 className="display-sub">Across the run</h2>
        <div className="figure-row">
          <div className="figure">
            <span className="figure-label">Buys scored</span>
            <span className="figure-value">{pooled.buys}</span>
            <span className="figure-sub">{pooled.events} distinct token minutes, {pooled.wallets} wallets</span>
          </div>
          <div className="figure">
            <span className="figure-label">Burst, median</span>
            <span className="figure-value">{fmtRatio(pooled.burst.median)}</span>
            <span className="figure-sub">new buyers against the prior hour</span>
          </div>
          <div className="figure">
            <span className="figure-label">Burst, 90th</span>
            <span className="figure-value">{fmtRatio(pooled.burst.p90)}</span>
            <span className="figure-sub">highest {fmtRatio(pooled.burst.max)}</span>
          </div>
          <div className="figure">
            <span className="figure-label">Crowded</span>
            <span className="figure-value">{pooled.nCrowded}</span>
            <span className="figure-sub">of {pooled.buys} buys at {CROWD_RATIO}x</span>
          </div>
        </div>
        <p className="pooled-verdict">
          {comparable ? (
            <>
              Entering one minute after a crowded buy returned <Delta value={pooled.crowded.median} /> at 24 hours,
              against <Delta value={pooled.uncrowded.median} /> after a quiet one. That is {pooled.crowded.n} crowded
              buys over {pooled.crowdedEvents} distinct token minutes on {pooled.crowdedTokens}{" "}
              {pooled.crowdedTokens === 1 ? "token" : "tokens"}, against {pooled.uncrowded.n} quiet ones.
            </>
          ) : (
            <>
              No return comparison yet. {pooled.nCrowded} of {pooled.buys} scored buys cleared {CROWD_RATIO}x the
              token&apos;s prior-hour buyer rate, and the comparison needs three on each side.
            </>
          )}
        </p>
      </section>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Verdict</th>
              <th className="num">Burst, 10 min</th>
              <th className="num">New buyers per buy</th>
              <th className="num">Baseline per hour</th>
              <th className="num">Fast arrivals</th>
              <th className="num">Crowded buys</th>
              <th className="num">Scored</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const note = fmtExcluded(r.excluded);
              return (
                <tr key={r.wallet} className={r.provisional ? "row-muted" : undefined}>
                  <td className="lead">
                    <Link href={`/wallet/${chain}/${r.wallet}?run=${run_id}`} className="wallet-addr">{shortAddr(r.wallet)}</Link>
                    {cluster.has(r.wallet) ? <span className="cell-note">same buys as {cluster.get(r.wallet)! - 1} other {cluster.get(r.wallet) === 2 ? "wallet" : "wallets"}</span> : null}
                  </td>
                  <td><VerdictTag verdict={r.verdict} provisional={r.provisional} /></td>
                  <td className="num">{fmtRatio(r.burstRatio)}</td>
                  <td className="num">{fmtNum(r.newBuyersPerBuy)}</td>
                  <td className="num">{fmtNum(r.baselinePerBuy)}</td>
                  <td className="num">{r.fastShare.mean == null ? "n/a" : fmtPct(r.fastShare.mean)}</td>
                  <td className="num">{r.n ? `${r.nCrowded} of ${r.n}` : "n/a"}</td>
                  <td className="num">
                    {r.n} {r.tokens === 1 ? "buy" : "buys"}, {r.tokens} {r.tokens === 1 ? "token" : "tokens"}
                    {note ? <span className="cell-note">{note}</span> : null}
                  </td>
                </tr>
              );
            })}
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
