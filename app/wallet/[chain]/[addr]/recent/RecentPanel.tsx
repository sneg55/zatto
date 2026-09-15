"use client";
import { useEffect, useState } from "react";
import { StatusTag } from "@/app/_components/Tag";
import { fmtDateTime, fmtUsd, shortAddr } from "@/lib/format";
import { explorerToken, explorerTx } from "@/lib/chains";

type Recent = {
  newest: { token: string; symbol?: string | null; ts: string; tx: string } | null;
  buyers: Array<{ address: string; secondsAfter: number; usd: number | null; tx: string }>;
  totalBuyers?: number;
  shown?: number;
  status: "final" | "provisional" | "none";
  reason?: string;
  stale?: boolean;
};

export function RecentPanel({ chain, wallet }: { chain: string; wallet: string }) {
  const [data, setData] = useState<Recent | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const load = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/recent/${chain}/${wallet}`);
      const j = await r.json().catch(() => null) as Recent | null;
      if (!j) { setData({ newest: null, buyers: [], status: "none", reason: `the server returned ${r.status} with no readable body` }); return; }
      setNote(data?.newest && j.newest && data.newest.tx !== j.newest.tx ? "newest buy changed, list restarted" : "");
      setData(j);
    } catch {
      setData({ newest: null, buyers: [], status: "none", reason: "the request did not complete, try again" });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); }, []);

  if (!data) {
    return (
      <div className="empty-state">
        <p className="eyebrow">Loading</p>
        <p>Fetching recent activity.</p>
      </div>
    );
  }

  if (!data.newest) {
    return (
      <div className="empty-state">
        <p className="eyebrow">No activity</p>
        <p>{data.reason ?? "No qualifying buys in 30 days."}</p>
      </div>
    );
  }

  const total = data.totalBuyers ?? data.buyers.length;
  const capped = total > data.buyers.length;

  return (
    <section>
      <div className="meta-block">
        <div className="meta-item">
          <span className="meta-label">Newest buy</span>
          <span className="meta-value">
            <a href={explorerToken(chain, data.newest.token)} target="_blank" rel="noopener noreferrer">
              {data.newest.symbol ?? shortAddr(data.newest.token)}
            </a>
            <span className="pill-note">
              <a href={explorerTx(chain, data.newest.tx)} target="_blank" rel="noopener noreferrer">tx</a>
            </span>
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">At</span>
          <span className="meta-value muted">{fmtDateTime(data.newest.ts)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Buyers after it</span>
          <span className="meta-value">{total}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Bucket status</span>
          <span className="meta-value"><StatusTag>{data.status}{data.status === "provisional" ? ", not final" : ""}</StatusTag></span>
        </div>
      </div>

      {data.stale ? <p className="status-note">Stale: {data.reason ?? "no reason given"}</p> : null}
      {note ? <p className="status-note">{note}</p> : null}

      <p className="link-row">
        <button className="btn" onClick={() => void load()} disabled={busy}>{busy ? "Refreshing" : "Refresh"}</button>
        {busy ? <span className="status-note" style={{ marginTop: 0 }}>Reading the tape around the newest buy.</span> : null}
      </p>

      {capped ? (
        <p className="foot-note">
          Showing the first {data.buyers.length} arrivals of {total}, ordered by how soon they followed.
        </p>
      ) : null}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Buyer</th><th className="num">Seconds after</th><th className="num">USD</th><th>Tx</th></tr>
          </thead>
          <tbody>
            {data.buyers.length === 0 ? (
              <tr><td colSpan={4} className="row-muted">No qualifying buyers found yet.</td></tr>
            ) : data.buyers.map((b) => (
              <tr key={b.tx}>
                <td data-label="Buyer" className="wallet-addr">{shortAddr(b.address)}</td>
                <td data-label="Seconds after" className="num">{b.secondsAfter}</td>
                <td data-label="USD" className="num">{fmtUsd(b.usd)}</td>
                <td data-label="Tx"><a href={explorerTx(chain, b.tx)} target="_blank" rel="noopener noreferrer">tx</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
