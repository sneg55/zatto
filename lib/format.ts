import type { GroupStat } from "./score/types";

export const fmtPct = (x: number | null): string => x == null ? "no price" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
export const fmtGroup = (g: GroupStat): string => g.insufficient ? `insufficient (n=${g.n})` : `${fmtPct(g.median)} (n=${g.n})`;
export const shortAddr = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const fmtNum = (x: number | null): string => x == null ? "n/a" : Number.isInteger(x) ? String(x) : x.toFixed(1);
