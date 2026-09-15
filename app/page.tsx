import Link from "next/link";

export default function Home() {
  return (
    <main>
      <section className="section" style={{ paddingTop: 8 }}>
        <h1 className="display-hero">Zatto</h1>
        <p className="lede">
          Point it at a Smart Money wallet and it tells you how many new buyers show up after it buys, how fast, and
          what buying after it would have returned.
        </p>
        <p className="link-row" style={{ marginTop: 24 }}>
          <Link href="/scan/base" className="btn">Base leaderboard</Link>
        </p>
      </section>

      <section className="section">
        <h2 className="display-sub">What it measures</h2>
        <ul className="card-list">
          <li className="card">
            <p>
              New buyers: distinct addresses that buy the same token within 10, 30 and 60 minutes after the
              wallet&apos;s buy, against the token&apos;s prior-hour rate.
            </p>
          </li>
          <li className="card">
            <p>
              Burst: new buyers in the 10 minutes after the buy, against the token&apos;s prior-hour rate scaled to
              the same 10 minutes. Fast arrivals: the share arriving within 20 seconds.
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

      <section className="section section-band" style={{ borderRadius: "var(--radius)", paddingInline: 24 }}>
        <h2 className="display-sub">Verdicts</h2>
        <p className="link-row" style={{ marginBottom: 16 }}>
          <span className="tag tag-crowded">CROWDED</span>
          <span className="tag tag-quiet">QUIET</span>
          <span className="tag tag-thin">THIN</span>
        </p>
        <p>
          CROWDED when more than half of scored buys drew at least three times the prior-hour buyer rate. QUIET
          otherwise. THIN under four scored buys. A wallet&apos;s repeated swaps into one token inside an hour count
          as one buy. The return comparison is pooled across the run and stated only when both groups hold at least
          three mature buys.
        </p>
      </section>
    </main>
  );
}
