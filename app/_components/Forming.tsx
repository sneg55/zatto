import Link from "next/link";
import type { BurstScore } from "@/lib/score/types";
import { fmtAge, fmtDateTime, fmtRatio, shortAddr } from "@/lib/format";
import { dexscreenerToken, explorerToken, nansenToken, walletHref } from "@/lib/chains";
import { CROWD_RATIO, FORMING_WINDOW_HOURS } from "@/lib/score/constants";

export function Forming({
  chain,
  runId,
  rows,
  symbols,
  subject,
  title,
}: {
  chain: string;
  runId?: string;
  rows: BurstScore[];
  symbols: Map<string, string>;
  subject?: string;
  title?: string;
}) {
  const crowded = rows.filter((r) => r.crowded).length;
  const oneToken = new Set(rows.map((r) => r.token)).size === 1;
  return (
    <section className="forming">
      <h2 className="display-sub">{title ?? "Forming now"}</h2>
      <p className="foot-note" style={{ marginTop: 0 }}>
        {subject ?? `Buys from the last ${FORMING_WINDOW_HOURS} hours by the wallets in this run`}, too new to
        carry a 24 hour return. These rows say who showed up, not what it paid. Pulled {CROWD_RATIO}x or more:{" "}
        {crowded} of {rows.length}.
      </p>
      <div className="table-wrap">
        <table className="data data-cards">
          <thead>
            <tr>
              {oneToken ? null : <th>Token</th>}
              <th>Wallet</th>
              <th>Bought</th>
              <th className="num">Buyers vs normal</th>
              <th className="num">New buyers, 10 min</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.tx}|${r.token}`} className={r.crowded ? undefined : "row-muted"}>
                {oneToken ? null : (
                  <td data-label="Token" className="lead">
                    <a href={explorerToken(chain, r.token)} target="_blank" rel="noopener noreferrer" className={symbols.get(r.token) ? undefined : "wallet-addr"}>
                      {symbols.get(r.token) ?? shortAddr(r.token)}
                    </a>
                    <span className="token-links">
                      <a href={nansenToken(chain, r.token)} target="_blank" rel="noopener noreferrer">Nansen</a>
                      <a href={dexscreenerToken(chain, r.token)} target="_blank" rel="noopener noreferrer">Dexscreener</a>
                    </span>
                  </td>
                )}
                <td data-label="Wallet" className={oneToken ? "lead" : undefined}>
                  <Link href={walletHref(chain, r.wallet, runId)} className="wallet-addr">{shortAddr(r.wallet)}</Link>
                </td>
                <td data-label="Bought">
                  {fmtAge(r.ts)}
                  <span className="cell-note">{fmtDateTime(r.ts)}</span>
                </td>
                <td data-label="Buyers vs normal" className="num">
                  {fmtRatio(r.burst)}
                  {r.crowded ? <span className="cell-note">crowded</span> : null}
                </td>
                <td data-label="New buyers, 10 min" className="num">
                  {r.newBuyers10}
                  <span className="cell-note">{r.baselineRate} in the hour before</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
