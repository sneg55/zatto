"use client";
import { useEffect, useState } from "react";

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
  if (!data) return <p>Loading</p>;
  if (!data.newest) return <p>{data.reason ?? "No qualifying buys in 30 days."}</p>;
  return (
    <section>
      <p>Newest buy: token {data.newest.token} at {data.newest.ts} (<a href={`https://basescan.org/tx/${data.newest.tx}`}>tx</a>). Bucket status: <strong>{data.status}</strong>{data.status === "provisional" ? ", bucket not final" : ""}{data.stale ? `, stale: ${data.reason ?? "no reason given"}` : ""}. {note}</p>
      <button onClick={() => void load()}>Refresh</button>
      <table><thead><tr><th>Buyer</th><th>Seconds after</th><th>USD</th><th>Tx</th></tr></thead>
        <tbody>{data.buyers.map((b) => <tr key={b.tx}><td>{b.address}</td><td>{b.secondsAfter}</td><td>{b.usd ?? ""}</td><td><a href={`https://basescan.org/tx/${b.tx}`}>tx</a></td></tr>)}</tbody>
      </table>
    </section>
  );
}
