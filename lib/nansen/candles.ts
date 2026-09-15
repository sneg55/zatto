import type { D1Like } from "../db/d1";
import { readCandleGaps, readCloses, writeCandleGap, writeCloses } from "../db/queries";
import { CARRY_FORWARD_MAX_MINUTES, MATURITY_MINUTES } from "../score/constants";
import type { NansenClient } from "./client";

interface Candle { interval_start?: string; timestamp?: string; date?: string; time?: string; close: number }
interface OhlcvResponse { token_address: string; timeframe: string; truncated?: boolean; truncation_note?: string | null; data: Candle[] }

function minuteOf(c: Candle): string | null {
  const ms = Date.parse(c.interval_start ?? c.timestamp ?? c.date ?? c.time ?? "");
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
  const from = new Date(new Date(`${past[0]}:00.000Z`).getTime() - CARRY_FORWARD_MAX_MINUTES * 60_000).toISOString();
  const to = new Date(new Date(`${past[past.length - 1]}:00.000Z`).getTime() + 60_000).toISOString();
  const { data } = await client.post<OhlcvResponse>("tgm/token-ohlcv", { chain, token_address: token, timeframe: "1m", date: { from, to } });
  const finalBefore = now.getTime() - MATURITY_MINUTES * 60_000;
  const candleMs: Array<{ ms: number; close: number }> = [];
  for (const c of data.data ?? []) {
    const minute = minuteOf(c);
    if (minute === null || !Number.isFinite(c.close) || c.close <= 0) continue;
    candleMs.push({ ms: Date.parse(`${minute}:00.000Z`), close: c.close });
  }
  candleMs.sort((a, b) => a.ms - b.ms);
  const lastCandleMs = candleMs.length ? candleMs[candleMs.length - 1].ms : null;
  const carryMs = CARRY_FORWARD_MAX_MINUTES * 60_000;
  const rows: Array<{ minute: string; close: number; final: boolean }> = [];
  const resolved = new Set<string>();
  let ptr = -1;
  for (const m of past) {
    const tMs = Date.parse(`${m}:00.000Z`);
    while (ptr + 1 < candleMs.length && candleMs[ptr + 1].ms <= tMs) ptr++;
    const beyondTruncation = data.truncated === true && (lastCandleMs === null || tMs > lastCandleMs);
    if (beyondTruncation || ptr < 0) continue;
    const candidate = candleMs[ptr];
    if (tMs - candidate.ms > carryMs) continue;
    rows.push({ minute: m, close: candidate.close, final: tMs <= finalBefore });
    resolved.add(m);
  }
  await writeCloses(db, chain, token, rows);
  for (const m of past) {
    if (resolved.has(m)) continue;
    const tMs = Date.parse(`${m}:00.000Z`);
    const beyondTruncation = data.truncated === true && (lastCandleMs === null || tMs > lastCandleMs);
    await writeCandleGap(db, chain, token, m, beyondTruncation ? "truncated" : "missing", nowIso);
  }
  return readCloses(db, chain, token, minutes);
}
