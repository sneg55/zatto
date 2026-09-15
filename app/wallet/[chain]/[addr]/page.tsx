import Link from "next/link";
import { getDb } from "@/lib/db/d1";
import { readScore } from "@/lib/db/queries";
import { fmtDateTime, fmtNum, fmtPct, shortAddr } from "@/lib/format";
import { RefreshButton } from "./RefreshButton";
import { VerdictTag } from "@/app/_components/Tag";
import { Delta, GroupDelta } from "@/app/_components/Delta";

export const dynamic = "force-dynamic";

export default async function WalletPage({ params, searchParams }: { params: Promise<{ chain: string; addr: string }>; searchParams: Promise<{ run?: string }> }) {
  const { chain, addr } = await params;
  const { run } = await searchParams;
  const wallet = addr.toLowerCase();
  const snap = await readScore(getDb(), chain, wallet, run ?? null);
  const stale = !snap || Date.now() - new Date(snap.computedAt).getTime() > 3_600_000;

  return (
    <main>
      <div className="page-head">
        <p className="eyebrow">{chain} wallet</p>
        <h1>{shortAddr(wallet)}</h1>
        <p className="link-row" style={{ margin: "16px 0 0" }}>
          <Link href={`/wallet/${chain}/${wallet}/recent`}>Recent activity</Link>
          <span className="divider-dot">&middot;</span>
          <a href={`https://basescan.org/address/${wallet}`}>Basescan</a>
          <span className="divider-dot">&middot;</span>
          <Link href={`/scan/${chain}`}>Back to the leaderboard</Link>
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
              <span className="meta-label">Usable buys</span>
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

          <p>{snap.score.returnNote}.</p>

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
            <table className="data">
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
                    <td>{fmtDateTime(b.ts)}</td>
                    <td className="wallet-addr">{shortAddr(b.token)}</td>
                    <td className="num">{b.baselineRate}</td>
                    <td className="num">{b.newBuyers.m10}</td>
                    <td className="num">{b.newBuyers.m30}</td>
                    <td className="num">{b.newBuyers.m60}</td>
                    <td className="num">{b.fastShare == null ? "n/a" : fmtPct(b.fastShare)}</td>
                    <td className="num">{b.crowdRatio10.toFixed(2)}x{b.crowded ? <span className="pill-note">crowded</span> : null}</td>
                    <td className="num">{b.crowdRatio.toFixed(2)}x</td>
                    <td className="num"><Delta value={b.leaderReturn.h24} /></td>
                    <td className="num"><Delta value={b.delayedReturn.h24} /></td>
                    <td>{b.usable ? "usable" : b.exclusion}</td>
                    <td><a href={`https://basescan.org/tx/${b.tx}`}>tx</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="foot-note">No snapshot yet.</p>}

      {stale ? <RefreshButton chain={chain} wallet={wallet} /> : null}
    </main>
  );
}
