import type { D1Like } from "./d1";

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
