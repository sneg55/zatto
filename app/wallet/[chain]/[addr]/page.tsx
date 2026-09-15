import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { readScore, readTokenNames } from "@/lib/db/queries";
import { fmtDateTime, fmtNum, fmtPct, shortAddr } from "@/lib/format";
import { explorerAddress, explorerToken, explorerTx, isAddress, isSupportedChain } from "@/lib/chains";
import { LOOKBACK_DAYS, MIN_USABLE_BUYS } from "@/lib/score/constants";
import { RefreshButton } from "./RefreshButton";
import { VerdictTag } from "@/app/_components/Tag";
import { Delta, GroupDelta } from "@/app/_components/Delta";

export const dynamic = "force-dynamic";

export default async function WalletPage({ params, searchParams }: { params: Promise<{ chain: string; addr: string }>; searchParams: Promise<{ run?: string }> }) {
  const { chain, addr } = await params;
  if (!isSupportedChain(chain) || !isAddress(addr)) notFound();
  const { run } = await searchParams;
  const wallet = addr.toLowerCase();
  const db = getDb();
  const snap = await readScore(db, chain, wallet, run ?? null);
  const stale = !snap || Date.now() - new Date(snap.computedAt).getTime() > 3_600_000;
  const symbols = snap ? await readTokenNames(db, chain, snap.score.buys.map((b) => b.token)) : new Map<string, string>();
  const nothingScored = snap ? snap.score.buys.length === 0 : false;
  const backHref = run ? `/scan/${chain}/${run}` : `/scan/${chain}`;

  return (
    <main>
      <div className="page-head">
        <p className="eyebrow">{chain} wallet</p>
        <h1>{shortAddr(wallet)}</h1>
        <p className="link-row" style={{ margin: "16px 0 0" }}>
          <Link href={`/wallet/${chain}/${wallet}/recent`}>Recent activity</Link>
          <span className="divider-dot">&middot;</span>
          <a href={explorerAddress(chain, wallet)} target="_blank" rel="noopener noreferrer">Basescan</a>
          <span className="divider-dot">&middot;</span>
          <Link href={backHref}>Back to the leaderboard</Link>
        </p>
      </div>

      {snap ? (
        <>
          <div className="meta-block">
            <div className="meta-item">
              <span className="meta-label">Verdict</span>
              <span className="meta-value"><VerdictTag verdict={snap.score.verdict} provisional={snap.score.provisional} /></span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Snapshot</span>
              <span className="meta-value muted">{fmtDateTime(snap.computedAt)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Run</span>
              <span className="meta-value muted">{snap.runId}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Scored buys</span>
              <span className="meta-value">{snap.score.n} across {snap.score.tokens} tokens</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">New buyers per buy</span>
              <span className="meta-value">{fmtNum(snap.score.newBuyersPerBuy)} vs {fmtNum(snap.score.baselinePerBuy)} per hour baseline</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Fast arrivals</span>
              <span className="meta-value">{snap.score.fastShare.mean == null ? "n/a" : fmtPct(snap.score.fastShare.mean)}</span>
            </div>
            <div className="meta-item meta-item-wide">
              <span className="meta-label">Excluded</span>
              <span className="meta-value muted">
                capped {snap.score.excluded.capped}, immature {snap.score.excluded.immature}, no price {snap.score.excluded.noPrice}
              </span>
            </div>
          </div>

          {nothingScored ? (
            <div className="empty-state" style={{ maxWidth: "none", textAlign: "left" }}>
              <p className="eyebrow">Nothing to score</p>
              <p style={{ margin: 0, maxWidth: "62ch" }}>
                This wallet made no qualifying buy in the last {LOOKBACK_DAYS} days. Zatto counts a buy only when the
                wallet spends a quote asset, USDC or ETH, on something else, and only once it is old enough for a 24
                hour return to settle. Sells, swaps between two quote assets and buys from the last two days are all
                left out, which is why every figure above is a zero rather than a low number.
              </p>
            </div>
          ) : (
            <>
              <p>{snap.score.returnNote}.</p>

              {snap.score.n > 0 && snap.score.n < MIN_USABLE_BUYS ? (
                <p className="foot-note">
                  THIN because {snap.score.n} scored {snap.score.n === 1 ? "buy is" : "buys are"} under the floor of{" "}
                  {MIN_USABLE_BUYS}. The numbers below are real, there are just too few of them to call a verdict on.
                </p>
              ) : null}

              <div className="card-list" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <div className="card">
                  <p className="eyebrow" style={{ marginBottom: 4 }}>Delayed-entry 24h</p>
                  <p style={{ margin: 0 }}>Crowded <GroupDelta group={snap.score.delayed24h.crowded} /></p>
                  <p style={{ margin: 0 }}>Quiet <GroupDelta group={snap.score.delayed24h.uncrowded} /></p>
                </div>
                <div className="card">
                  <p className="eyebrow" style={{ marginBottom: 4 }}>Leader 24h</p>
                  <p style={{ margin: 0 }}>Crowded <GroupDelta group={snap.score.leader24h.crowded} /></p>
                  <p style={{ margin: 0 }}>Quiet <GroupDelta group={snap.score.leader24h.uncrowded} /></p>
                </div>
              </div>

              <div className="table-wrap">
                <table className="data data-cards">
                  <thead>
                    <tr>
                      <th>Time</th><th>Token</th><th className="num">Baseline/h</th>
                      <th className="num">New 10m</th><th className="num">New 30m</th><th className="num">New 60m</th>
                      <th className="num">Fast</th><th className="num">Burst 10m</th><th className="num">Ratio 60m</th>
                      <th className="num">Leader 24h</th><th className="num">Delayed 24h</th>
                      <th>State</th><th>Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.score.buys.map((b) => (
                      <tr key={b.tx} className={b.usable ? undefined : "row-muted"}>
                        <td data-label="Time">{fmtDateTime(b.ts)}</td>
                        <td data-label="Token">
                          <a href={explorerToken(chain, b.token)} target="_blank" rel="noopener noreferrer" className={symbols.get(b.token) ? undefined : "wallet-addr"}>
                            {symbols.get(b.token) ?? shortAddr(b.token)}
                          </a>
                        </td>
                        <td data-label="Baseline/h" className="num">{b.baselineRate}</td>
                        <td data-label="New 10m" className="num">{b.newBuyers.m10}</td>
                        <td data-label="New 30m" className="num">{b.newBuyers.m30}</td>
                        <td data-label="New 60m" className="num">{b.newBuyers.m60}</td>
                        <td data-label="Fast" className="num">{b.fastShare == null ? "n/a" : fmtPct(b.fastShare)}</td>
                        <td data-label="Burst 10m" className="num">{b.crowdRatio10.toFixed(2)}x{b.crowded ? <span className="pill-note">crowded</span> : null}</td>
                        <td data-label="Ratio 60m" className="num">{b.crowdRatio.toFixed(2)}x</td>
                        <td data-label="Leader 24h" className="num"><Delta value={b.leaderReturn.h24} /></td>
                        <td data-label="Delayed 24h" className="num"><Delta value={b.delayedReturn.h24} /></td>
                        <td data-label="State">{b.usable ? "scored" : b.exclusion}</td>
                        <td data-label="Tx"><a href={explorerTx(chain, b.tx)} target="_blank" rel="noopener noreferrer">tx</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="empty-state" style={{ maxWidth: "none", textAlign: "left" }}>
          <p className="eyebrow">No snapshot</p>
          <p style={{ margin: 0, maxWidth: "62ch" }}>
            Zatto has never scored this wallet. Press Refresh live to read it from the Nansen API now.
          </p>
        </div>
      )}

      <RefreshButton chain={chain} wallet={wallet} stale={stale} />
    </main>
  );
}
