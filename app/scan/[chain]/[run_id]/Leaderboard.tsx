"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { WalletScore } from "@/lib/score/types";
import { fmtExcluded, fmtNum, fmtPct, fmtRatio, shortAddr } from "@/lib/format";
import { VerdictTag } from "@/app/_components/Tag";

type Column = {
  key: string;
  label: string;
  num?: boolean;
  sort: (r: WalletScore) => number;
};

const COLUMNS: Column[] = [
  { key: "burst", label: "Burst, 10 min", num: true, sort: (r) => r.burstRatio ?? -Infinity },
  { key: "newBuyers", label: "New buyers per buy", num: true, sort: (r) => r.newBuyersPerBuy ?? -Infinity },
  { key: "baseline", label: "Baseline per hour", num: true, sort: (r) => r.baselinePerBuy ?? -Infinity },
  { key: "fast", label: "Fast arrivals", num: true, sort: (r) => r.fastShare.mean ?? -Infinity },
  { key: "crowded", label: "Crowded buys", num: true, sort: (r) => r.nCrowded },
  { key: "scored", label: "Scored", num: true, sort: (r) => r.n },
];

const VERDICT_RANK: Record<WalletScore["verdict"], number> = { CROWDED: 0, QUIET: 1, THIN: 2 };

export function Leaderboard({ chain, runId, rows, cluster }: { chain: string; runId: string; rows: WalletScore[]; cluster: Record<string, number> }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);

  const ordered = useMemo(() => {
    if (!sort) return rows;
    const column = COLUMNS.find((c) => c.key === sort.key);
    const of = column ? column.sort : (r: WalletScore) => -VERDICT_RANK[r.verdict];
    return [...rows].sort((a, b) => (sort.desc ? of(b) - of(a) : of(a) - of(b)) || a.wallet.localeCompare(b.wallet));
  }, [rows, sort]);

  const toggle = (key: string) => setSort((s) => (s && s.key === key ? (s.desc ? { key, desc: false } : null) : { key, desc: true }));
  const arrow = (key: string) => (sort?.key !== key ? "" : sort.desc ? " ↓" : " ↑");

  return (
    <>
      <div className="table-wrap">
        <table className="data data-cards">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>
                <button type="button" className="th-sort" onClick={() => toggle("verdict")} aria-label="Sort by verdict">
                  Verdict{arrow("verdict")}
                </button>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.num ? "num" : undefined}>
                  <button type="button" className="th-sort" onClick={() => toggle(c.key)} aria-label={`Sort by ${c.label}`}>
                    {c.label}{arrow(c.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => {
              const note = fmtExcluded(r.excluded);
              const peers = cluster[r.wallet];
              return (
                <tr key={r.wallet} className={r.provisional ? "row-muted" : undefined}>
                  <td data-label="Wallet" className="lead">
                    <Link href={`/wallet/${chain}/${r.wallet}?run=${runId}`} className="wallet-addr">{shortAddr(r.wallet)}</Link>
                    {peers ? <span className="cell-note">same buys as {peers - 1} other {peers === 2 ? "wallet" : "wallets"}</span> : null}
                  </td>
                  <td data-label="Verdict"><VerdictTag verdict={r.verdict} provisional={r.provisional} /></td>
                  <td data-label="Burst, 10 min" className="num">{fmtRatio(r.burstRatio)}</td>
                  <td data-label="New buyers per buy" className="num">{fmtNum(r.newBuyersPerBuy)}</td>
                  <td data-label="Baseline per hour" className="num">{fmtNum(r.baselinePerBuy)}</td>
                  <td data-label="Fast arrivals" className="num">{r.fastShare.mean == null ? "n/a" : fmtPct(r.fastShare.mean)}</td>
                  <td data-label="Crowded buys" className="num">{r.n ? `${r.nCrowded} of ${r.n}` : "n/a"}</td>
                  <td data-label="Scored" className="num">
                    {r.n} {r.n === 1 ? "buy" : "buys"}, {r.tokens} {r.tokens === 1 ? "token" : "tokens"}
                    {note ? <span className="cell-note">{note}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="foot-note">
        {sort ? "Sorted by the column you picked. Click its header again to reverse it, once more to return to the verdict order." : "Ordered by verdict, then by new buyers per buy. Click a column header to sort by it."}
      </p>
    </>
  );
}
