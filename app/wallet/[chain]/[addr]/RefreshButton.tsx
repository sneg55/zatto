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
        try {
          const r = await fetch(`/api/wallet/${chain}/${wallet}`, { method: "POST" });
          const j = await r.json().catch(() => null) as { stale?: boolean; reason?: string; partial?: number } | null;
          if (!j) setState(`refresh failed: the server returned ${r.status} with no readable body`);
          else if (j.stale) setState(`cached result shown: ${j.reason ?? "no reason given"}`);
          else if (!r.ok) setState(`refresh failed: the server returned ${r.status}`);
          else { setState(j.partial ? `done, ${j.partial} buys left out under the live request cap` : "done"); router.push(`/wallet/${chain}/${wallet}`); }
        } catch {
          setState("refresh failed: the request did not complete, try again");
        }
      }}>Refresh live</button> {state}
    </p>
  );
}
