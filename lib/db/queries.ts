import type { D1Like } from "./d1";
import type { Buy, TapeRow } from "../score/types";

export async function countCallsToday(db: D1Like, dayStartIso: string): Promise<{ reserved: number; ok: number; failed: number }> {
  const rows = (await db.prepare(
    "SELECT status, COALESCE(SUM(credits),0) AS credits FROM calls WHERE ts >= ? GROUP BY status"
  ).bind(dayStartIso).all<{ status: string; credits: number }>()).results;
  const out = { reserved: 0, ok: 0, failed: 0 };
  for (const r of rows) out[r.status as keyof typeof out] = Number(r.credits);
  return out;
}

export async function countLifetimeOkCalls(db: D1Like): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM calls WHERE status = 'ok'").first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function jobsByStatus(db: D1Like): Promise<Record<string, number>> {
  const rows = (await db.prepare("SELECT status, COUNT(*) AS n FROM scan_jobs GROUP BY status").all<{ status: string; n: number }>()).results;
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

export function utcDayStart(now: Date): string {
  return now.toISOString().slice(0, 10) + "T00:00:00.000Z";
}

export async function reserveCredits(db: D1Like, p: { ts: string; dayStart: string; endpoint: string; credits: number; budget: number; runId: string | null }): Promise<number | null> {
  const row = await db.prepare(
    `INSERT INTO calls (ts, endpoint, credits, run_id, status)
     SELECT ?, ?, ?, ?, 'reserved'
     WHERE (SELECT COALESCE(SUM(credits),0) FROM calls WHERE ts >= ? AND status IN ('reserved','ok')) + ? <= ?
     RETURNING id`
  ).bind(p.ts, p.endpoint, p.credits, p.runId, p.dayStart, p.credits, p.budget).first<{ id: number }>();
  return row?.id ?? null;
}

export async function finishCall(db: D1Like, id: number, status: "ok" | "failed", remainingMinute: number | null, remainingSecond: number | null): Promise<void> {
  await db.prepare("UPDATE calls SET status = ?, remaining_minute = ?, remaining_second = ? WHERE id = ?").bind(status, remainingMinute, remainingSecond, id).run();
}

export async function lastRateRemaining(db: D1Like): Promise<{ minute: number | null; ts: string } | null> {
  return db.prepare("SELECT remaining_minute AS minute, ts FROM calls WHERE status IN ('ok','failed') AND remaining_minute IS NOT NULL ORDER BY id DESC LIMIT 1").first();
}

export async function upsertBuys(db: D1Like, buys: Buy[], fetchedAt: string): Promise<void> {
  if (!buys.length) return;
  await db.batch(buys.map((b) => db.prepare(
    "INSERT OR REPLACE INTO buys (chain, wallet, token, tx, ts, usd, price, fetched_at) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(b.chain, b.wallet, b.token, b.tx, b.ts, b.usd, b.price, fetchedAt)));
}

export async function setWalletFetched(db: D1Like, chain: string, wallet: string, at: string): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO wallet_fetch (chain, wallet, last_fetched) VALUES (?,?,?)").bind(chain, wallet, at).run();
}

export async function walletFetchedAt(db: D1Like, chain: string, wallet: string): Promise<string | null> {
  const r = await db.prepare("SELECT last_fetched FROM wallet_fetch WHERE chain = ? AND wallet = ?").bind(chain, wallet).first<{ last_fetched: string }>();
  return r?.last_fetched ?? null;
}

export async function loadBuys(db: D1Like, chain: string, wallet: string, limit: number): Promise<Buy[]> {
  return (await db.prepare("SELECT chain, wallet, token, tx, ts, usd, price FROM buys WHERE chain = ? AND wallet = ? ORDER BY ts DESC LIMIT ?").bind(chain, wallet, limit).all<Buy>()).results;
}

export interface TapeRowRecord { rows: string; row_count: number; pages_exhausted: number; capped: number; matured: number; fetched_at: string }

export async function readTape(db: D1Like, chain: string, token: string, hour: string): Promise<TapeRowRecord | null> {
  return db.prepare("SELECT rows, row_count, pages_exhausted, capped, matured, fetched_at FROM tape WHERE chain = ? AND token = ? AND hour = ?").bind(chain, token, hour).first<TapeRowRecord>();
}

export async function writeTape(db: D1Like, p: { chain: string; token: string; hour: string; rows: TapeRow[]; pagesExhausted: boolean; capped: boolean; matured: boolean; fetchedAt: string }): Promise<void> {
  const json = JSON.stringify(p.rows);
  await db.prepare(
    "INSERT OR REPLACE INTO tape (chain, token, hour, rows, row_count, pages_exhausted, capped, matured, fetched_at, bytes) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(p.chain, p.token, p.hour, json, p.rows.length, p.pagesExhausted ? 1 : 0, p.capped ? 1 : 0, p.matured ? 1 : 0, p.fetchedAt, json.length).run();
}

export async function takeTapeLock(db: D1Like, chain: string, token: string, hour: string, nowIso: string, leaseUntilIso: string): Promise<boolean> {
  await db.prepare("DELETE FROM tape_lock WHERE chain = ? AND token = ? AND hour = ? AND lease_until < ?").bind(chain, token, hour, nowIso).run();
  const r = await db.prepare("INSERT OR IGNORE INTO tape_lock (chain, token, hour, lease_until) VALUES (?,?,?,?)").bind(chain, token, hour, leaseUntilIso).run();
  return r.meta.changes === 1;
}

export async function releaseTapeLock(db: D1Like, chain: string, token: string, hour: string): Promise<void> {
  await db.prepare("DELETE FROM tape_lock WHERE chain = ? AND token = ? AND hour = ?").bind(chain, token, hour).run();
}

export async function readCloses(db: D1Like, chain: string, token: string, minutes: string[]): Promise<Map<string, { close: number; final: boolean }>> {
  const out = new Map<string, { close: number; final: boolean }>();
  for (let i = 0; i < minutes.length; i += 90) {
    const chunk = minutes.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT minute, close, final FROM candles WHERE chain = ? AND token = ? AND minute IN (${chunk.map(() => "?").join(",")})`).bind(chain, token, ...chunk).all<{ minute: string; close: number; final: number }>()).results;
    for (const r of rows) out.set(r.minute, { close: r.close, final: r.final === 1 });
  }
  return out;
}

export async function writeCloses(db: D1Like, chain: string, token: string, rows: Array<{ minute: string; close: number; final: boolean }>): Promise<void> {
  for (let i = 0; i < rows.length; i += 25) {
    await db.batch(rows.slice(i, i + 25).map((r) => db.prepare("INSERT OR REPLACE INTO candles (chain, token, minute, close, final) VALUES (?,?,?,?,?)").bind(chain, token, r.minute, r.close, r.final ? 1 : 0)));
  }
}

export async function writeCandleGap(db: D1Like, chain: string, token: string, minute: string, reason: "missing" | "truncated" | "pending", at: string): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO candle_gap (chain, token, minute, reason, checked_at) VALUES (?,?,?,?,?)").bind(chain, token, minute, reason, at).run();
}

export async function readCandleGaps(db: D1Like, chain: string, token: string, minutes: string[]): Promise<Map<string, { reason: string; checked_at: string }>> {
  const out = new Map<string, { reason: string; checked_at: string }>();
  for (let i = 0; i < minutes.length; i += 90) {
    const chunk = minutes.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT minute, reason, checked_at FROM candle_gap WHERE chain = ? AND token = ? AND minute IN (${chunk.map(() => "?").join(",")})`).bind(chain, token, ...chunk).all<{ minute: string; reason: string; checked_at: string }>()).results;
    for (const r of rows) out.set(r.minute, r);
  }
  return out;
}
