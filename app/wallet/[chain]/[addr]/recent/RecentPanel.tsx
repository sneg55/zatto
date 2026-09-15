"use client";
import { useEffect, useState } from "react";

type Recent = { newest: { token: string; ts: string; tx: string } | null; buyers: Array<{ address: string; secondsAfter: number; usd: number | null; tx: string }>; status: "final" | "provisional" | "none" };

export function RecentPanel({ chain, wallet }: { chain: string; wallet: string }) {
  const [data, setData] = useState<Recent | null>(null);
  const [note, setNote] = useState("");
  const load = async () => {
    const r = await fetch(`/api/recent/${chain}/${wallet}`);
    const j = await r.json() as Recent;
    setNote(data?.newest && j.newest && data.newest.tx !== j.newest.tx ? "newest buy changed, list restarted" : "");
    setData(j);
  };
  useEffect(() => { void load(); }, []);
  if (!data) return <p>Loading</p>;
  if (!data.newest) return <p>No qualifying buys in 30 days.</p>;
  return (
    <section>
      <p>Newest buy: token {data.newest.token} at {data.newest.ts} (<a href={`https://basescan.org/tx/${data.newest.tx}`}>tx</a>). Bucket status: <strong>{data.status}</strong>{data.status === "provisional" ? ", bucket not final" : ""}. {note}</p>
      <button onClick={() => void load()}>Refresh</button>
      <table><thead><tr><th>Buyer</th><th>Seconds after</th><th>USD</th><th>Tx</th></tr></thead>
        <tbody>{data.buyers.map((b) => <tr key={b.tx}><td>{b.address}</td><td>{b.secondsAfter}</td><td>{b.usd ?? ""}</td><td><a href={`https://basescan.org/tx/${b.tx}`}>tx</a></td></tr>)}</tbody>
      </table>
    </section>
  );
}
