import type { TapeBucket, TapeRow } from "@/lib/score/types";

const T0 = Date.parse("2026-09-10T14:03:11Z");
const row = (offsetSec: number, trader: string, action: "BUY" | "SELL" = "BUY", price = 1): TapeRow =>
  [new Date(T0 + offsetSec * 1000).toISOString(), trader, action, 100, price, `0xtx${offsetSec}${trader}`, null];

export const LEADER = "0xleader";
export const T0_ISO = new Date(T0).toISOString();

export function buckets(rows: TapeRow[], opts: { final?: boolean; capped?: boolean } = {}): TapeBucket[] {
  const byHour = new Map<string, TapeRow[]>();
  for (const r of rows) {
    const h = r[0].slice(0, 13);
    byHour.set(h, [...(byHour.get(h) ?? []), r]);
  }
  for (const h of ["2026-09-10T13", "2026-09-10T14", "2026-09-10T15"]) if (!byHour.has(h)) byHour.set(h, []);
  return [...byHour.entries()].sort().map(([hour, rs]) => ({ hour, rows: rs, final: opts.final ?? true, capped: opts.capped ?? false }));
}

export const crowdedRows: TapeRow[] = [
  row(-3000, "0xprior1"), row(-1200, "0xprior2"), row(-600, "0xprior2"), row(-30, "0xprior3"),
  row(0, LEADER, "BUY", 1.0),
  row(5, "0xfast1", "BUY", 1.02), row(12, "0xfast2", "BUY", 1.03), row(19, "0xfast3", "BUY", 1.03),
  row(70, "0xslow1", "BUY", 1.05), row(400, "0xslow2", "BUY", 1.06), row(900, "0xslow3"), row(1500, "0xslow4"),
  row(2400, "0xslow5"), row(3000, "0xprior1"), row(3300, "0xslow6"), row(3500, "0xslow7"), row(3599, "0xslow8"),
  row(3700, "0xlate1"),
];

export function closes(entries: Array<[minuteOffset: number, close: number]>, final = true) {
  const m = new Map<string, { close: number; final: boolean }>();
  for (const [off, close] of entries) m.set(new Date(T0 - (T0 % 60000) + off * 60000).toISOString().slice(0, 16), { close, final });
  return m;
}
