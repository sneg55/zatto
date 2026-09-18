import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { readWalletHistories } from "@/lib/db/queries";
import { copiedBoard, persistence } from "@/lib/score/copied";
import { fmtAge, fmtPct, fmtRatio, shortAddr } from "@/lib/format";
import { isSupportedChain } from "@/lib/chains";
import { MIN_COPY_BUYS } from "@/lib/score/constants";
import { Delta } from "@/app/_components/Delta";

export const dynamic = "force-dynamic";

export default async function CopiedPage({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  if (!isSupportedChain(chain)) notFound();
  const histories = await readWalletHistories(getDb(), chain);
  const rows = copiedBoard(histories);
  const test = persistence(histories);
  const ranked = rows.filter((r) => r.qualifies);
  const withCrowd = rows.filter((r) => r.crowded > 0);
  const actors = rows.reduce((n, r) => n + r.wallets.length, 0);
  const buys = rows.reduce((n, r) => n + r.buys, 0);

  return (
    <main>
      <div className="page-head">
        <p className="eyebrow">{chain} standing board</p>
        <h1>Worth copying</h1>
        <p className="link-row" style={{ margin: "16px 0 0" }}>
          <Link href={`/scan/${chain}`}>Latest run</Link>
          <span className="divider-dot">&middot;</span>
          <Link href="/">Check a token</Link>
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="eyebrow">Nothing scored yet</p>
          <h1>No wallets on record</h1>
          <p>Once a scan run publishes, the wallets it scored appear here, ranked by what copying them returned.</p>
        </div>
      ) : (
        <>
          <div className="meta-block">
            <div className="meta-item">
              <span className="meta-label">Wallets</span>
              <span className="meta-value">{actors}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Clusters</span>
              <span className="meta-value">{rows.length}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Ranked</span>
              <span className="meta-value">{ranked.length}</span>
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

          {test.actors >= 4 && test.topLaterMedian != null && test.restLaterMedian != null ? (
            <section className="signal-band">
              <p className="signal">
                Does the ranking hold? The {test.topActors} wallets that led on their earlier buys went on to return{" "}
                {fmtPct(test.topLaterMedian)} on their later ones, {test.topLaterHigher} of {test.topLater} higher at
                24 hours. The other {test.actors - test.topActors} returned {fmtPct(test.restLaterMedian)},{" "}
                {test.restLaterHigher} of {test.restLater} higher.
              </p>
            </section>
          ) : null}

          <p className="foot-note" style={{ marginTop: -16 }}>
            Every wallet Zatto has scored, ranked by what buying one minute after it and holding a day returned,
            over all of its buys rather than only the crowded ones, because a copier gets every buy. A wallet needs{" "}
            {MIN_COPY_BUYS} priced buys to be ranked; the rest sit below. Wallets with identical buy lists are one
            row, because that is one trader running several addresses.
          </p>

          <div className="table-wrap">
            <table className="data data-cards">
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th className="num">Copying returned</th>
                  <th className="num">Crowded buys</th>
                  <th className="num">Buyers vs normal</th>
                  <th className="num">Peak</th>
                  <th className="num">Tokens</th>
                  <th className="num">Copy return, crowded</th>
                  <th className="num">Newest buy</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.wallets[0]} className={r.qualifies ? undefined : "row-muted"}>
                    <td data-label="Wallet" className="lead">
                      <Link href={`/wallet/${chain}/${r.wallets[0]}`} className="wallet-addr">{shortAddr(r.wallets[0])}</Link>
                      {r.wallets.length > 1 ? (
                        <span className="cell-note">cluster of {r.wallets.length} wallets, one buy list</span>
                      ) : null}
                    </td>
                    <td data-label="Copying returned" className="num">
                      {r.copyN ? <Delta value={r.copyReturn} /> : "n/a"}
                      {r.copyN ? (
                        <span className="cell-note">
                          {r.copyHigher} of {r.copyN} higher{r.qualifies ? "" : ", under the floor"}
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Crowded buys" className="num">{r.crowded} of {r.buys}</td>
                    <td data-label="Buyers vs normal" className="num">{fmtRatio(r.medianBurst)}</td>
                    <td data-label="Peak" className="num">{fmtRatio(r.maxBurst)}</td>
                    <td data-label="Tokens" className="num">{r.tokens}</td>
                    <td data-label="Copy return, crowded" className="num">
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
            Both return columns are medians of buying one minute after the wallet and holding a day. They measure
            copying the wallet, not what the wallet itself made.
          </p>
        </>
      )}
    </main>
  );
}
