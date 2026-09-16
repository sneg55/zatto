"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScanButton({ chain, token, label }: { chain: string; token: string; label: string }) {
  const [state, setState] = useState<string>("");
  const router = useRouter();
  return (
    <div style={{ marginTop: 16 }}>
      <button
        className="btn"
        disabled={state === "running"}
        onClick={async () => {
          setState("running");
          try {
            const r = await fetch(`/api/token/${chain}/${token}`, { method: "POST" });
            const j = await r.json().catch(() => null) as { stale?: boolean; reason?: string; scan?: { skipped?: number } } | null;
            if (!j) setState(`scan failed: the server returned ${r.status} with no readable body`);
            else if (j.stale) setState(`cached result shown: ${j.reason ?? "no reason given"}`);
            else if (!r.ok) setState(`scan failed: the server returned ${r.status}`);
            else {
              setState(j.scan?.skipped ? `done, ${j.scan.skipped} entries left out under the live request cap` : "done");
              router.refresh();
            }
          } catch {
            setState("scan failed: the request did not complete, try again");
          }
        }}
      >
        {state === "running" ? "Reading the live API" : label}
      </button>
      {state && state !== "running" ? <p className="status-note">{state}</p> : null}
    </div>
  );
}
