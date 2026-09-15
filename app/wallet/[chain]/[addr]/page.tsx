import Link from "next/link";
import { getDb } from "@/lib/db/d1";
import { readScore } from "@/lib/db/queries";
import { fmtGroup, fmtNum, fmtPct, shortAddr } from "@/lib/format";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";

export default async function WalletPage({ params, searchParams }: { params: Promise<{ chain: string; addr: string }>; searchParams: Promise<{ run?: string }> }) {
  const { chain, addr } = await params;
  const { run } = await searchParams;
  const wallet = addr.toLowerCase();
  const snap = await readScore(getDb(), chain, wallet, run ?? null);
  const stale = !snap || Date.now() - new Date(snap.computedAt).getTime() > 3_600_000;
  return (
    <main>
      <h1>{shortAddr(wallet)} on {chain}</h1>
      <p><Link href={`/wallet/${chain}/${wallet}/recent`}>Recent activity</Link> · <a href={`https://basescan.org/address/${wallet}`}>Basescan</a></p>
      {snap ? (
        <>
          <p>Snapshot {snap.computedAt} from run {snap.runId}{snap.score.provisional ? ", provisional" : ""}. Verdict: <strong>{snap.score.verdict}</strong>. {snap.score.returnNote}.</p>
          <p>Usable buys {snap.score.n} across {snap.score.tokens} tokens; excluded: capped {snap.score.excluded.capped}, immature {snap.score.excluded.immature}, no price {snap.score.excluded.noPrice}. New buyers per buy {fmtNum(snap.score.newBuyersPerBuy)} vs baseline {fmtNum(snap.score.baselinePerBuy)} per hour. Fast arrivals {snap.score.fastShare.mean == null ? "n/a" : fmtPct(snap.score.fastShare.mean)}.</p>
          <p>Delayed-entry 24h: crowded {fmtGroup(snap.score.delayed24h.crowded)}, quiet {fmtGroup(snap.score.delayed24h.uncrowded)}. Leader 24h: crowded {fmtGroup(snap.score.leader24h.crowded)}, quiet {fmtGroup(snap.score.leader24h.uncrowded)}.</p>
          <table>
            <thead><tr><th>Time</th><th>Token</th><th>Baseline/h</th><th>New 10m</th><th>New 30m</th><th>New 60m</th><th>Fast</th><th>Ratio</th><th>Leader 24h</th><th>Delayed 24h</th><th>State</th><th>Tx</th></tr></thead>
            <tbody>
              {snap.score.buys.map((b) => (
                <tr key={b.tx}>
                  <td>{b.ts}</td><td>{shortAddr(b.token)}</td><td>{b.baselineRate}</td><td>{b.newBuyers.m10}</td><td>{b.newBuyers.m30}</td><td>{b.newBuyers.m60}</td>
                  <td>{b.fastShare == null ? "n/a" : fmtPct(b.fastShare)}</td><td>{b.crowdRatio.toFixed(2)}{b.crowded ? " crowded" : ""}</td>
                  <td>{fmtPct(b.leaderReturn.h24)}</td><td>{fmtPct(b.delayedReturn.h24)}</td>
                  <td>{b.usable ? "usable" : b.exclusion}</td><td><a href={`https://basescan.org/tx/${b.tx}`}>tx</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : <p>No snapshot yet.</p>}
      {stale ? <RefreshButton chain={chain} wallet={wallet} /> : null}
    </main>
  );
}
