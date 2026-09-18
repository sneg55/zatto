import type { BaseRate } from "@/lib/score/baseRates";
import { fmtPct } from "@/lib/format";
import { MIN_RATE_OBSERVATIONS, SIGNAL_RATIO } from "@/lib/score/constants";

export function BaseRateTable({ rates }: { rates: BaseRate[] }) {
  const total = rates.reduce((n, r) => n + r.n, 0);
  return (
    <>
      <div className="table-wrap">
        <table className="data data-cards">
          <thead>
            <tr>
              <th>Buyers vs normal</th>
              <th className="num">Buys</th>
              <th className="num">Tokens</th>
              <th className="num">Higher at 24h</th>
              <th className="num">Median</th>
              <th className="num">Worst</th>
              <th className="num">Best</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.label} className={r.min >= SIGNAL_RATIO ? undefined : "row-muted"}>
                <td data-label="Buyers vs normal" className="lead">{r.label}</td>
                <td data-label="Buys" className="num">{r.n}</td>
                <td data-label="Tokens" className="num">{r.tokens}</td>
                <td data-label="Higher at 24h" className="num">
                  {r.n ? `${r.higher} of ${r.n}` : "n/a"}
                  {r.n && !r.statable ? <span className="cell-note">too few to call</span> : null}
                </td>
                <td data-label="Median" className="num">{r.statable ? fmtPct(r.median) : "n/a"}</td>
                <td data-label="Worst" className="num">{r.statable ? fmtPct(r.worst) : "n/a"}</td>
                <td data-label="Best" className="num">{r.statable ? fmtPct(r.best) : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="foot-note">
        Every Smart Money buy Zatto has measured on Base, {total} of them. The return is what buying one minute
        after it and holding a day would have made.
      </p>
    </>
  );
}
