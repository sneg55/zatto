import Link from "next/link";
import { getDb } from "@/lib/db/d1";
import { latestPublishedJob, readObservations } from "@/lib/db/queries";
import { WalletLookup } from "@/app/_components/WalletLookup";
import { baseRates } from "@/lib/score/baseRates";
import { BaseRateTable } from "@/app/_components/BaseRateTable";

export const dynamic = "force-dynamic";

async function latest() {
  const db = getDb();
  const job = await latestPublishedJob(db, "base");
  if (!job) return null;
  return { rates: baseRates(await readObservations(db, "base")) };
}

export default async function Home() {
  const run = await latest();

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <h1 className="display-hero">Is anyone buying in behind Smart Money?</h1>
          <p className="lede">
            Paste a Base token. Zatto shows every Smart Money buy in it, how many new buyers arrived in the 10
            minutes after each one, and what tokens at that level of buying have done a day later.
          </p>
          <div style={{ marginTop: 28 }}>
            <WalletLookup chain="base" />
          </div>
          <p className="link-row" style={{ marginTop: 20, marginBottom: 0 }}>
            <Link href="/copied/base">What copying each wallet returned</Link>
            <span className="divider-dot">&middot;</span>
            <Link href="/scan/base">Base leaderboard</Link>
          </p>
        </div>
      </section>

      {run ? (
        <section className="section" id="evidence">
          <h2 className="display-sub">What each level has been worth</h2>
          <p style={{ maxWidth: "68ch", marginTop: 0 }}>
            New buyers in the 10 minutes after a Smart Money buy, against the token&apos;s normal rate, and how
            often the token was higher 24 hours later.
          </p>
          <BaseRateTable rates={run.rates} />
        </section>
      ) : null}
    </main>
  );
}
