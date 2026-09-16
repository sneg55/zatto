import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { readLatestScorePerWallet } from "@/lib/db/queries";
import { copiedBoard } from "@/lib/score/copied";
import { fmtAge, fmtRatio, shortAddr } from "@/lib/format";
import { isSupportedChain } from "@/lib/chains";
import { CROWD_RATIO } from "@/lib/score/constants";
import { Delta } from "@/app/_components/Delta";

export const dynamic = "force-dynamic";

export default async function CopiedPage({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  if (!isSupportedChain(chain)) notFound();
  const rows = copiedBoard(await readLatestScorePerWallet(getDb(), chain));
  const withCrowd = rows.filter((r) => r.crowded > 0);
  const actors = rows.reduce((n, r) => n + r.wallets.length, 0);
  const buys = rows.reduce((n, r) => n + r.buys, 0);

  return (
    <main>
      <div className="page-head">
        <p className="eyebrow">{chain} standing board</p>
        <h1>Most copied</h1>
        <p className="link-row" style={{ margin: "16px 0 0" }}>
          <Link href={`/scan/${chain}`}>Latest run</Link>
          <span className="divider-dot">&middot;</span>
          <Link href="/#method">How it measures</Link>
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="eyebrow">Nothing scored yet</p>
          <h1>No wallets on record</h1>
          <p>Once a scan run publishes, the wallets it scored appear here ranked by how often buying crowded behind them.</p>
        </div>
      ) : (
        <>
          <div className="meta-block">
            <div className="meta-item">
              <span className="meta-label">Wallets</span>
              <span className="meta-value">{actors}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Acting separately</span>
              <span className="meta-value">{rows.length}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Drew a crowd</span>
              <span className="meta-value">{withCrowd.length}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Scored buys</span>
              <span className="meta-value">{buys}</span>
            </div>
          </div>

          <p className="foot-note" style={{ marginTop: -16 }}>
            Every wallet Zatto has scored, at its most recent snapshot, ranked by how many of its buys drew at least{" "}
            {CROWD_RATIO} times the token&apos;s prior-hour buyer rate in the 10 minutes after it. Wallets whose
            scored buys are the same token minutes are one row, because they are one actor rather than several
            wallets agreeing.
          </p>

          <div className="table-wrap">
            <table className="data data-cards">
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th className="num">Crowded buys</th>
                  <th className="num">Burst, median</th>
                  <th className="num">Hardest burst</th>
                  <th className="num">Tokens</th>
                  <th className="num">Crowded, delayed 24h</th>
                  <th className="num">Newest buy</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.wallets[0]} className={r.crowded ? undefined : "row-muted"}>
                    <td data-label="Wallet" className="lead">
                      <Link href={`/wallet/${chain}/${r.wallets[0]}`} className="wallet-addr">{shortAddr(r.wallets[0])}</Link>
                      {r.wallets.length > 1 ? (
                        <span className="cell-note">a fleet of {r.wallets.length} wallets on one buy list</span>
                      ) : null}
                    </td>
                    <td data-label="Crowded buys" className="num">{r.crowded} of {r.buys}</td>
                    <td data-label="Burst, median" className="num">{fmtRatio(r.medianBurst)}</td>
                    <td data-label="Hardest burst" className="num">{fmtRatio(r.maxBurst)}</td>
                    <td data-label="Tokens" className="num">{r.tokens}</td>
                    <td data-label="Crowded, delayed 24h" className="num">
                      <Delta value={r.crowdedDelayed24h} />
                      {r.crowdedReturns ? <span className="cell-note">over {r.crowdedReturns} {r.crowdedReturns === 1 ? "buy" : "buys"}</span> : null}
                    </td>
                    <td data-label="Newest buy" className="num">{fmtAge(r.newestBuy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="foot-note">
            Delayed 24h is the median return of entering one minute after this wallet&apos;s crowded buys, over the
            number of those buys that carry a settled price. A median over one or two buys is one or two
            observations, not a rate. It says what following the wallet into a crowd would have paid, not what the
            wallet itself made.
          </p>
        </>
      )}
    </main>
  );
}
