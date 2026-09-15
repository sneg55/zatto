import type { D1Like } from "../db/d1";
import { readCandleGaps, readCloses, writeCandleGap, writeCloses } from "../db/queries";
import { MATURITY_MINUTES } from "../score/constants";
import type { NansenClient } from "./client";

interface Candle { timestamp?: string; date?: string; time?: string; close: number }
interface OhlcvResponse { token_address: string; timeframe: string; truncated?: boolean; truncation_note?: string | null; data: Candle[] }

function minuteOf(c: Candle): string | null {
  const ms = Date.parse(c.timestamp ?? c.date ?? c.time ?? "");
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16) : null;
}

export async function getCloses(db: D1Like, client: NansenClient, chain: string, token: string, minutes: string[], now: Date): Promise<Map<string, { close: number; final: boolean }>> {
  const have = await readCloses(db, chain, token, minutes);
  const gaps = await readCandleGaps(db, chain, token, minutes);
  const nowIso = now.toISOString();
  const missing = minutes.filter((m) => {
    if (have.get(m)?.final) return false;
    const g = gaps.get(m);
    if (!g) return true;
    if (g.reason === "pending" || g.reason === "truncated") return true;
    return now.getTime() - new Date(g.checked_at).getTime() > 86_400_000;
  });
  if (missing.length === 0) return have;
  const future = missing.filter((m) => new Date(`${m}:00.000Z`).getTime() > now.getTime());
  for (const m of future) await writeCandleGap(db, chain, token, m, "pending", nowIso);
  const past = missing.filter((m) => !future.includes(m)).sort();
  if (past.length === 0) return have;
  const from = `${past[0]}:00.000Z`;
  const to = new Date(new Date(`${past[past.length - 1]}:00.000Z`).getTime() + 60_000).toISOString();
  const { data } = await client.post<OhlcvResponse>("tgm/token-ohlcv", { chain, token_address: token, timeframe: "1m", date: { from, to } });
  const finalBefore = now.getTime() - MATURITY_MINUTES * 60_000;
  const wanted = new Set(minutes);
  const rows: Array<{ minute: string; close: number; final: boolean }> = [];
  for (const c of data.data ?? []) {
    const minute = minuteOf(c);
    if (minute === null || !wanted.has(minute) || !Number.isFinite(c.close) || c.close <= 0) continue;
    rows.push({ minute, close: c.close, final: new Date(`${minute}:00.000Z`).getTime() <= finalBefore });
  }
  await writeCloses(db, chain, token, rows);
  const got = new Set(rows.map((r) => r.minute));
  for (const m of past) if (!got.has(m)) await writeCandleGap(db, chain, token, m, data.truncated ? "truncated" : "missing", nowIso);
  return readCloses(db, chain, token, minutes);
}
