import Link from "next/link";
import { getDb } from "@/lib/db/d1";
import { latestPublishedJob, readObservations, readScoresForRun, readTokenNames } from "@/lib/db/queries";
import { pooledRun } from "@/lib/score/perWallet";
import { fmtAge, fmtDateTime, fmtRatio } from "@/lib/format";
import { Delta } from "@/app/_components/Delta";
import type { BurstScore } from "@/lib/score/types";
import { WalletLookup } from "@/app/_components/WalletLookup";
import { CROWD_RATIO, FORMING_WINDOW_HOURS, SIGNAL_RATIO } from "@/lib/score/constants";
import { baseRates, rateFor } from "@/lib/score/baseRates";
import { NoSignal, Signal } from "@/app/_components/Signal";
import { BaseRateTable } from "@/app/_components/BaseRateTable";
import { shortAddr } from "@/lib/format";

export const dynamic = "force-dynamic";

async function latest() {
  const db = getDb();
  const job = await latestPublishedJob(db, "base");
  if (!job) return null;
  const rows = await readScoresForRun(db, "base", job.run_id);
  if (rows.length === 0) return null;
  const forming = JSON.parse(job.forming ?? "[]") as BurstScore[];
  const rates = baseRates(await readObservations(db, "base"));
  const live = forming.filter((f) => f.burst >= SIGNAL_RATIO).sort((a, b) => (a.ts < b.ts ? 1 : -1))[0] ?? null;
  const symbols = live ? await readTokenNames(db, "base", [live.token]) : new Map<string, string>();
  return {
    job, pooled: pooledRun(rows), forming, rates, live,
    liveName: live ? symbols.get(live.token) ?? shortAddr(live.token) : null,
    wallets: rows.length, crowdedWallets: rows.filter((r) => r.verdict === "CROWDED").length,
  };
}

export default async function Home() {
  const run = await latest();
  const comparable = run !== null && !run.pooled.crowded.insufficient && !run.pooled.uncrowded.insufficient;

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <h1 className="display-hero">Who gets copied</h1>
          <p className="lede">
            Point Zatto at a Smart Money wallet and it tells you how many new buyers show up after it buys, how
            fast they arrive, and what buying one minute behind it would have returned. Point it at a token and it
            tells you which Smart Money wallets bought it and how hard buying crowded after each one.
          </p>
          <div style={{ marginTop: 28 }}>
            <WalletLookup chain="base" />
          </div>
          <p className="link-row" style={{ marginTop: 20, marginBottom: 0 }}>
            <Link href="/copied/base">Or see what copying each wallet returned</Link>
            <span className="divider-dot">&middot;</span>
            <Link href="/scan/base">Base leaderboard</Link>
            <span className="divider-dot">&middot;</span>
            <Link href="#method">How it measures</Link>
          </p>
        </div>

        {run ? (
          <aside className="hero-panel">
            <p className="eyebrow">Right now on Base</p>
            {run.live && run.liveName ? (
              <Signal
                rate={rateFor(run.rates, run.live.burst)}
                burst={run.live.burst}
                at={run.live.ts}
                subject={run.liveName}
              />
            ) : (
              <NoSignal threshold={SIGNAL_RATIO} hours={FORMING_WINDOW_HOURS} subject="the wallets Zatto tracks" />
            )}
            {comparable ? (
              <p className="hero-panel-note">
                Entering a minute after a crowded buy returned <Delta value={run.pooled.crowded.median} /> at 24
                hours, against <Delta value={run.pooled.uncrowded.median} /> after a quiet one. That is{" "}
                {run.pooled.crowded.n} crowded buys over {run.pooled.crowdedEvents} entries on{" "}
                {run.pooled.crowdedTokens} {run.pooled.crowdedTokens === 1 ? "token" : "tokens"}, against{" "}
                {run.pooled.uncrowded.n} quiet ones.
              </p>
            ) : (
              <p className="hero-panel-note">
                {run.pooled.nCrowded} of {run.pooled.buys} scored entries cleared {CROWD_RATIO}x the token&apos;s
                prior-hour buyer rate.
              </p>
            )}
            <p className="hero-panel-meta">
              Scored buys carry a 24 hour return, so the newest is {fmtAge(run.pooled.evidence.newest)}.
              {run.forming.length ? (
                <>
                  {" "}Alongside them, {run.forming.length} buys from the last two days already have a burst,{" "}
                  {run.forming.filter((f) => f.crowded).length} of them crowded.
                </>
              ) : null}
            </p>
            <p className="hero-panel-meta">
              <Link href={`/scan/base/${run.job.run_id}`}>{run.job.run_id}</Link>
              {run.job.finished_at ? `, ${fmtDateTime(run.job.finished_at)}` : null}
            </p>
          </aside>
        ) : null}
      </section>

      {run ? (
        <section className="section" id="evidence">
          <h2 className="display-sub">What a burst has been worth</h2>
          <p style={{ maxWidth: "68ch", marginTop: 0 }}>
            Of the entries Zatto has already measured at a given burst, how many were higher a day later.
          </p>
          <BaseRateTable rates={run.rates} />
        </section>
      ) : null}

      <section className="section" id="method">
        <h2 className="display-sub">How it measures</h2>
        <ul className="card-list">
          <li className="card">
            <p>
              New buyers: distinct addresses that buy the same token within 10, 30 and 60 minutes after the
              wallet&apos;s buy, against the token&apos;s prior-hour rate.
            </p>
          </li>
          <li className="card">
            <p>
              Burst: new buyers in the 10 minutes after the buy, against that prior-hour rate scaled to the same 10
              minutes. Fast arrivals: the share arriving within 20 seconds.
            </p>
          </li>
          <li className="card">
            <p>
              Returns: the token&apos;s price from the wallet&apos;s fill, and from a delayed entry one minute
              later, at 1 hour and 24 hours.
            </p>
          </li>
        </ul>
      </section>

      <section className="section section-band" style={{ borderRadius: "var(--radius)", paddingInline: 28 }}>
        <h2 className="display-sub">Verdicts</h2>
        <p className="link-row" style={{ marginBottom: 16 }}>
          <span className="tag tag-crowded">CROWDED</span>
          <span className="tag tag-quiet">QUIET</span>
          <span className="tag tag-thin">THIN</span>
        </p>
        <p style={{ maxWidth: "68ch" }}>
          A token is CROWDED when at least one scored entry drew {CROWD_RATIO} times the token&apos;s prior-hour
          buyer rate in the 10 minutes after it, and QUIET when none did. Wallets carry the same words on a stricter
          rule: CROWDED needs more than half of the wallet&apos;s own scored buys to clear that bar, and THIN means
          under four scored buys.
          {run ? (
            <>
              {" "}Wallets clearing the wallet rule on the latest run: {run.crowdedWallets} of {run.wallets},
              because crowding concentrates in tokens rather than spreading across a wallet&apos;s whole book.
            </>
          ) : null}
        </p>
        <p style={{ maxWidth: "68ch" }}>
          A wallet&apos;s repeated swaps into one token inside an hour count as one buy. The return comparison is
          pooled across the run and stated only when both groups hold at least three mature buys. Returns need 24
          hours to settle, so every scored buy on a board is at least two days old. The Forming now panel on a run
          carries the newer buys, with a burst and no return.
        </p>
      </section>
    </main>
  );
}
