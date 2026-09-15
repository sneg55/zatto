"use client";
import { useEffect, useState } from "react";
import { StatusTag } from "@/app/_components/Tag";
import { shortAddr } from "@/lib/format";

type Recent = { newest: { token: string; ts: string; tx: string } | null; buyers: Array<{ address: string; secondsAfter: number; usd: number | null; tx: string }>; status: "final" | "provisional" | "none"; reason?: string; stale?: boolean };

export function RecentPanel({ chain, wallet }: { chain: string; wallet: string }) {
  const [data, setData] = useState<Recent | null>(null);
  const [note, setNote] = useState("");
  const load = async () => {
    try {
      const r = await fetch(`/api/recent/${chain}/${wallet}`);
      const j = await r.json().catch(() => null) as Recent | null;
      if (!j) { setData({ newest: null, buyers: [], status: "none", reason: `the server returned ${r.status} with no readable body` }); return; }
      setNote(data?.newest && j.newest && data.newest.tx !== j.newest.tx ? "newest buy changed, list restarted" : "");
      setData(j);
    } catch {
      setData({ newest: null, buyers: [], status: "none", reason: "the request did not complete, try again" });
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

  return (
    <section>
      <div className="meta-block">
        <div className="meta-item">
          <span className="meta-label">Newest buy</span>
          <span className="meta-value">
            {shortAddr(data.newest.token)} <span className="pill-note"><a href={`https://basescan.org/tx/${data.newest.tx}`}>tx</a></span>
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">At</span>
          <span className="meta-value muted">{data.newest.ts}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Bucket status</span>
          <span className="meta-value"><StatusTag>{data.status}{data.status === "provisional" ? ", not final" : ""}</StatusTag></span>
        </div>
      </div>

      {data.stale ? <p className="status-note">Stale: {data.reason ?? "no reason given"}</p> : null}
      {note ? <p className="status-note">{note}</p> : null}

      <p className="link-row">
        <button className="btn" onClick={() => void load()}>Refresh</button>
      </p>

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
                <td className="wallet-addr">{shortAddr(b.address)}</td>
                <td className="num">{b.secondsAfter}</td>
                <td className="num">{b.usd ?? ""}</td>
                <td><a href={`https://basescan.org/tx/${b.tx}`}>tx</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
