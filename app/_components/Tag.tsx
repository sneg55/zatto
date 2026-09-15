import type { ReactNode } from "react";
import type { Verdict } from "@/lib/score/types";

const verdictClass: Record<Verdict, string> = {
  CROWDED: "tag-crowded",
  QUIET: "tag-quiet",
  THIN: "tag-thin",
};

export function VerdictTag({ verdict, provisional }: { verdict: Verdict; provisional?: boolean }) {
  return (
    <span className={`tag ${verdictClass[verdict]}`}>
      {verdict}
      {provisional ? <span className="pill-note">provisional</span> : null}
    </span>
  );
}

export function StatusTag({ children }: { children: ReactNode }) {
  return <span className="tag tag-status">{children}</span>;
}
