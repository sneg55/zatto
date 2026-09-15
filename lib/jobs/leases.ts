import type { D1Like } from "../db/d1";

export const LEASE_SECONDS = 60;
export const MAX_ATTEMPTS = 5;

export async function takeLiveSlot(db: D1Like, concurrency: number, nowIso: string, untilIso: string): Promise<string | null> {
  await db.prepare("DELETE FROM live_leases WHERE lease_until < ?").bind(nowIso).run();
  for (let i = 0; i < concurrency; i++) {
    const r = await db.prepare("INSERT OR IGNORE INTO live_leases (key, lease_until) VALUES (?, ?)").bind(`live-${i}`, untilIso).run();
    if (r.meta.changes === 1) return `live-${i}`;
  }
  return null;
}

export async function releaseLiveSlot(db: D1Like, key: string): Promise<void> {
  await db.prepare("DELETE FROM live_leases WHERE key = ?").bind(key).run();
}

export async function bumpIp(db: D1Like, ipHash: string, hour: string): Promise<number> {
  await db.prepare("INSERT INTO ip_counters (ip_hash, hour, count) VALUES (?,?,1) ON CONFLICT(ip_hash, hour) DO UPDATE SET count = count + 1").bind(ipHash, hour).run();
  const r = await db.prepare("SELECT count FROM ip_counters WHERE ip_hash = ? AND hour = ?").bind(ipHash, hour).first<{ count: number }>();
  return Number(r?.count ?? 0);
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
