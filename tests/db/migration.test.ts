import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";

describe("migration", () => {
  it("creates every table in spec 4", async () => {
    const db = openTestDb();
    const rows = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
    for (const t of ["tape","tape_lock","buys","wallet_fetch","candles","candle_gap","scores","scan_jobs","calls","live_leases","ip_counters"]) {
      expect(rows).toContain(t);
    }
  });
  it("rejects a duplicate payment_id", async () => {
    const db = openTestDb();
    const ins = (id: string) => db.prepare("INSERT INTO scan_jobs (run_id, chain, source, status, created_at, payment_id) VALUES (?,?,?,?,?,?)").bind(id, "base", "paid", "created", "2026-09-15T00:00:00Z", "pay-1").run();
    await ins("r1");
    await expect(ins("r2")).rejects.toThrow();
  });
});
