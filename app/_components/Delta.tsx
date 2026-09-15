import { fmtPct } from "@/lib/format";
import type { GroupStat } from "@/lib/score/types";

export function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="delta delta-na">{fmtPct(value)}</span>;
  const cls = value < 0 ? "delta-neg" : "delta-pos";
  return <span className={`delta ${cls}`}>{fmtPct(value)}</span>;
}

export function GroupDelta({ group }: { group: GroupStat }) {
  if (group.insufficient) return <span className="delta delta-na">insufficient (n={group.n})</span>;
  return (
    <>
      <Delta value={group.median} /> (n={group.n})
    </>
  );
}
