import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { publishedJobs, readJob, readScoresForRun, readTokenNames } from "@/lib/db/queries";
import { clusterGroups, clusters, pooledRun, sortLeaderboard, tokenBreakdown } from "@/lib/score/perWallet";
import { fmtAge, fmtDateTime, fmtRatio, shortAddr } from "@/lib/format";
import { isSupportedChain } from "@/lib/chains";
import type { Candidate } from "@/lib/jobs/types";
import { StatusTag } from "@/app/_components/Tag";
import { Delta } from "@/app/_components/Delta";
import { PaidScan } from "@/app/_components/PaidScan";
import { Leaderboard } from "./Leaderboard";
import { TokenBoard } from "./TokenBoard";
import { CROWD_RATIO } from "@/lib/score/constants";

export const dynamic = "force-dynamic";

export default async function ScanRun({ params }: { params: Promise<{ chain: string; run_id: string }> }) {
  const { chain, run_id } = await params;
  if (!isSupportedChain(chain)) notFound();
  const db = getDb();
  const job = await readJob(db, run_id);
  if (!job || job.chain !== chain) {
    return (
      <main>
        <div className="empty-state">
          <p className="eyebrow">Not found</p>
          <h1>Run not found</h1>
          <p>There is no scan run {run_id} on {chain}.</p>
          <p className="link-row" style={{ justifyContent: "center", marginTop: 16 }}>
            <Link href={`/scan/${chain}`}>Latest {chain} run</Link>
          </p>
        </div>
      </main>
    );
  }
  const rows = sortLeaderboard(await readScoresForRun(db, chain, run_id));
  const pooled = pooledRun(rows);
  const cluster = Object.fromEntries(clusters(rows));
  const fleets = clusterGroups(rows);
  const fleetWallets = fleets.reduce((n, g) => n + g.length, 0);
  const candidates = JSON.parse(job.candidates) as Candidate[];
  const dropped = candidates.filter((c) => c.dropped);
  const comparable = !pooled.crowded.insufficient && !pooled.uncrowded.insufficient;
  const byToken = tokenBreakdown(rows);
  const crowdedTokens = byToken.filter((t) => t.verdict === "CROWDED");
  const quietTokens = byToken.filter((t) => t.verdict === "QUIET");
  const symbols = await readTokenNames(db, chain, byToken.map((t) => t.token));
  const history = (await publishedJobs(db, chain, 6)).filter((j) => j.run_id !== run_id);
  const baseUrl = process.env.PUBLIC_BASE_URL ?? "https://zatto.nsawinyh.workers.dev";

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
                paid, <a href={`https://basescan.org/tx/${job.payment_tx}`} target="_blank" rel="noopener noreferrer">settlement tx</a>
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
        <div className="meta-item">
          <span className="meta-label">Take it with you</span>
          <span className="meta-value">
            <a href={`/api/run/${chain}/${run_id}`} target="_blank" rel="noopener noreferrer">JSON</a>
          </span>
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
          <div className="figure">
            <span className="figure-label">Newest evidence</span>
            <span className="figure-value">{fmtAge(pooled.evidence.newest)}</span>
            <span className="figure-sub">median {fmtAge(pooled.evidence.median)}, oldest {fmtAge(pooled.evidence.oldest)}</span>
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
        {fleets.length ? (
          <p className="pooled-note">
            {fleetWallets} of the {rows.length} scanned wallets buy in lockstep with at least one other, in{" "}
            {fleets.length} {fleets.length === 1 ? "fleet" : "fleets"}, the largest holding {fleets[0].length}{" "}
            wallets on an identical buy list. A fleet reads as several wallets agreeing when it is one actor, so its
            entries are counted once per token minute above.
          </p>
        ) : null}
      </section>

      {pooled.buys ? (
        <section className="band">
          <h2 className="display-sub">How hard the bursts hit</h2>
          <p className="foot-note" style={{ marginTop: 0 }}>
            Every scored buy placed by its 10 minute burst against the token&apos;s prior-hour rate. Anything from 3x
            is called crowded.
          </p>
          <ul className="histogram">
            {pooled.distribution.map((b) => (
              <li key={b.label} className={b.label === "3 to 5x" || b.label === "5x and up" ? "bar-crowded" : undefined}>
                <span className="bar-label">{b.label}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${pooled.buys ? Math.round((b.count / pooled.buys) * 100) : 0}%` }} />
                </span>
                <span className="bar-count">{b.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {byToken.length ? (
        <section className="section">
          <h2 className="display-sub">Where the crowding happened</h2>
          <p className="foot-note" style={{ marginTop: 0 }}>
            {crowdedTokens.length} of {byToken.length} tokens took at least one entry into a {CROWD_RATIO}x burst,
            hardest first. Open a token to see which wallets entered it and when.
          </p>
          <TokenBoard chain={chain} runId={run_id} tokens={crowdedTokens} quiet={quietTokens} symbols={symbols} cluster={cluster} />
        </section>
      ) : null}

      <section className="section">
        <h2 className="display-sub">The wallets behind them</h2>
        <p className="foot-note" style={{ marginTop: 0 }}>
          Each scanned wallet with the burst its own buys attracted. A wallet is only called crowded when more than
          half of its scored buys cleared {CROWD_RATIO}x, so a wallet can sit on a crowded token and still read quiet.
        </p>
        <Leaderboard chain={chain} runId={run_id} rows={rows} cluster={cluster} />
      </section>

      {dropped.length ? (
        <p className="foot-note">
          Not scored under the request cap: {dropped.map((c) => `${shortAddr(c.wallet)} (${c.dropped})`).join(", ")}
        </p>
      ) : null}

      <PaidScan chain={chain} baseUrl={baseUrl} />

      {history.length ? (
        <section className="section">
          <h2 className="display-sub">Earlier runs</h2>
          <ul className="run-list">
            {history.map((j) => (
              <li key={j.run_id}>
                <Link href={`/scan/${chain}/${j.run_id}`} className="run-id">{j.run_id}</Link>
                <span className="run-list-meta">
                  {j.source}, {j.finished_at ? fmtDateTime(j.finished_at) : "unfinished"}, {j.used_requests} requests
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
