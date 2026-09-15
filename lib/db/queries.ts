import type { D1Like } from "./d1";
import type { Buy, TapeRow, WalletScore } from "../score/types";
import type { ScanJob, Candidate } from "../jobs/types";

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

export async function walletHasBuys(db: D1Like, chain: string, wallet: string): Promise<boolean> {
  const r = await db.prepare("SELECT 1 AS present FROM buys WHERE chain = ? AND wallet = ? LIMIT 1").bind(chain, wallet).first<{ present: number }>();
  return r !== null;
}

export interface TapeRowRecord { rows: string; row_count: number; pages_exhausted: number; capped: number; matured: number; fetched_at: string }

export async function readTape(db: D1Like, chain: string, token: string, hour: string): Promise<TapeRowRecord | null> {
  return db.prepare("SELECT rows, row_count, pages_exhausted, capped, matured, fetched_at FROM tape WHERE chain = ? AND token = ? AND hour = ?").bind(chain, token, hour).first<TapeRowRecord>();
}

export async function finalTapeBuckets(db: D1Like, chain: string, tokens: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < tokens.length; i += 90) {
    const chunk = tokens.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT token, hour FROM tape WHERE chain = ? AND token IN (${chunk.map(() => "?").join(",")}) AND pages_exhausted = 1 AND matured = 1 AND capped = 0`).bind(chain, ...chunk).all<{ token: string; hour: string }>()).results;
    for (const r of rows) out.add(`${r.token}|${r.hour}`);
  }
  return out;
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

export async function createJob(db: D1Like, p: { runId: string; chain: string; source: "cron" | "paid"; status: "created" | "settled"; paymentId?: string; now: string }): Promise<void> {
  await db.prepare("INSERT INTO scan_jobs (run_id, chain, source, status, created_at, payment_id) VALUES (?,?,?,?,?,?)").bind(p.runId, p.chain, p.source, p.status, p.now, p.paymentId ?? null).run();
}

export async function readJob(db: D1Like, runId: string): Promise<ScanJob | null> {
  return db.prepare("SELECT * FROM scan_jobs WHERE run_id = ?").bind(runId).first<ScanJob>();
}

export async function readJobByPayment(db: D1Like, paymentId: string): Promise<ScanJob | null> {
  return db.prepare("SELECT * FROM scan_jobs WHERE payment_id = ?").bind(paymentId).first<ScanJob>();
}

export async function takeJobLease(db: D1Like, runId: string, nowIso: string, untilIso: string): Promise<boolean> {
  const r = await db.prepare("UPDATE scan_jobs SET lease_until = ? WHERE run_id = ? AND status IN ('settled','running') AND (lease_until IS NULL OR lease_until < ?)").bind(untilIso, runId, nowIso).run();
  return r.meta.changes === 1;
}

export async function releaseJobLease(db: D1Like, runId: string): Promise<void> {
  await db.prepare("UPDATE scan_jobs SET lease_until = NULL WHERE run_id = ?").bind(runId).run();
}

export async function saveJobPlan(db: D1Like, runId: string, candidates: Candidate[], planned: number, startedAt: string): Promise<void> {
  await db.prepare("UPDATE scan_jobs SET candidates = ?, planned_requests = ?, status = 'running', started_at = ? WHERE run_id = ?").bind(JSON.stringify(candidates), planned, startedAt, runId).run();
}

export async function saveJobProgress(db: D1Like, runId: string, cursor: number, bucketCursor: number, usedRequests: number): Promise<void> {
  await db.prepare(
    `UPDATE scan_jobs SET cursor = ?, bucket_cursor = ?, used_requests = ?,
       attempts = CASE WHEN ? > cursor OR (? = cursor AND ? > bucket_cursor) THEN 0 ELSE attempts END
     WHERE run_id = ?`
  ).bind(cursor, bucketCursor, usedRequests, cursor, cursor, bucketCursor, runId).run();
}

export async function publishJob(db: D1Like, runId: string, finishedAt: string, usedRequests: number): Promise<void> {
  await db.prepare("UPDATE scan_jobs SET status = 'done', published = 1, finished_at = ?, used_requests = ?, lease_until = NULL WHERE run_id = ?").bind(finishedAt, usedRequests, runId).run();
}

export async function failJob(db: D1Like, runId: string, error: string, finishedAt: string): Promise<void> {
  await db.prepare("UPDATE scan_jobs SET status = 'failed', error = ?, finished_at = ?, lease_until = NULL WHERE run_id = ?").bind(error, finishedAt, runId).run();
}

export async function setJobPayment(db: D1Like, runId: string, tx: string): Promise<void> {
  await db.prepare("UPDATE scan_jobs SET status = 'settled', payment_tx = ? WHERE run_id = ?").bind(tx, runId).run();
}

export async function expiredRunningJobs(db: D1Like, nowIso: string, maxAttempts: number): Promise<ScanJob[]> {
  return (await db.prepare("SELECT * FROM scan_jobs WHERE status IN ('settled','running') AND (lease_until IS NULL OR lease_until < ?) AND attempts < ?").bind(nowIso, maxAttempts).all<ScanJob>()).results;
}

export async function bumpAttempts(db: D1Like, runId: string): Promise<number> {
  await db.prepare("UPDATE scan_jobs SET attempts = attempts + 1 WHERE run_id = ?").bind(runId).run();
  const r = await db.prepare("SELECT attempts FROM scan_jobs WHERE run_id = ?").bind(runId).first<{ attempts: number }>();
  return Number(r?.attempts ?? 0);
}

export async function latestCronJobCreatedAt(db: D1Like, chain: string): Promise<string | null> {
  const r = await db.prepare("SELECT created_at FROM scan_jobs WHERE chain = ? AND source = 'cron' ORDER BY created_at DESC LIMIT 1").bind(chain).first<{ created_at: string }>();
  return r?.created_at ?? null;
}

export async function latestPublishedJob(db: D1Like, chain: string): Promise<ScanJob | null> {
  return db.prepare("SELECT * FROM scan_jobs WHERE chain = ? AND published = 1 ORDER BY finished_at DESC LIMIT 1").bind(chain).first<ScanJob>();
}

export async function writeScore(db: D1Like, s: WalletScore, runId: string, computedAt: string): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO scores (chain, wallet, run_id, computed_at, provisional, result) VALUES (?,?,?,?,?,?)").bind(s.chain, s.wallet, runId, computedAt, s.provisional ? 1 : 0, JSON.stringify(s)).run();
}

export async function readScoresForRun(db: D1Like, chain: string, runId: string): Promise<WalletScore[]> {
  return (await db.prepare("SELECT result FROM scores WHERE chain = ? AND run_id = ?").bind(chain, runId).all<{ result: string }>()).results.map((r) => JSON.parse(r.result) as WalletScore);
}

export async function readScore(db: D1Like, chain: string, wallet: string, runId: string | null): Promise<{ score: WalletScore; runId: string; computedAt: string } | null> {
  const r = runId
    ? await db.prepare("SELECT result, run_id, computed_at FROM scores WHERE chain = ? AND wallet = ? AND run_id = ?").bind(chain, wallet, runId).first<{ result: string; run_id: string; computed_at: string }>()
    : await db.prepare("SELECT result, run_id, computed_at FROM scores WHERE chain = ? AND wallet = ? AND run_id NOT LIKE 'zatto:scored:%' ORDER BY computed_at DESC LIMIT 1").bind(chain, wallet).first<{ result: string; run_id: string; computed_at: string }>();
  return r ? { score: JSON.parse(r.result), runId: r.run_id, computedAt: r.computed_at } : null;
}

export async function writeScratchScore(db: D1Like, chain: string, wallet: string, scratchKey: string, computedAt: string, result: unknown): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO scores (chain, wallet, run_id, computed_at, provisional, result) VALUES (?,?,?,?,1,?)").bind(chain, wallet, scratchKey, computedAt, JSON.stringify(result)).run();
}

export async function readScratchScore(db: D1Like, chain: string, wallet: string, scratchKey: string): Promise<string | null> {
  const r = await db.prepare("SELECT result FROM scores WHERE chain = ? AND wallet = ? AND run_id = ?").bind(chain, wallet, scratchKey).first<{ result: string }>();
  return r?.result ?? null;
}

export async function deleteScratchScores(db: D1Like, runId: string): Promise<void> {
  await db.prepare("DELETE FROM scores WHERE run_id LIKE ?").bind(`zatto:scored:${runId}:%`).run();
}
