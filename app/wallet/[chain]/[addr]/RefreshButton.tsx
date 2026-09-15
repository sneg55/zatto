"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton({ chain, wallet }: { chain: string; wallet: string }) {
  const [state, setState] = useState<string>("");
  const router = useRouter();
  return (
    <p>
      <button disabled={state === "running"} onClick={async () => {
        setState("running");
        const r = await fetch(`/api/wallet/${chain}/${wallet}`, { method: "POST" });
        const j = await r.json() as { stale?: boolean; reason?: string; partial?: number };
        if (j.stale) setState(`cached result shown: ${j.reason}`);
        else { setState(j.partial ? `done, ${j.partial} buys left out under the live request cap` : "done"); router.push(`/wallet/${chain}/${wallet}`); }
      }}>Refresh live</button> {state}
    </p>
  );
}
