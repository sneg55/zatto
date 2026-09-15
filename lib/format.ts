import type { GroupStat } from "./score/types";

export const fmtPct = (x: number | null): string => x == null ? "no price" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
export const fmtGroup = (g: GroupStat): string => g.insufficient ? `insufficient (n=${g.n})` : `${fmtPct(g.median)} (n=${g.n})`;
export const shortAddr = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const fmtNum = (x: number | null): string => x == null ? "n/a" : Number.isInteger(x) ? String(x) : x.toFixed(1);

const FMT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDate();
  const month = FMT_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm} UTC`;
};

export const fmtUsd = (x: number | null): string => {
  if (x == null) return "";
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  if (abs === 0) return "$0";
  if (abs < 0.01) return `${sign}<$0.01`;
  if (abs >= 1) return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `${sign}$${abs.toFixed(2)}`;
};
