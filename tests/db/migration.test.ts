import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { readTokenNames, upsertTokenNames } from "@/lib/db/queries";

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

describe("token names", () => {
  it("stores one symbol per token and reads back only what it has", async () => {
    const db = openTestDb();
    await upsertTokenNames(db, "base", [
      { token: "0xAAA", symbol: "LOTTO" },
      { token: "0xaaa", symbol: "LOTTO" },
      { token: "0xbbb", symbol: "" },
    ], "2026-09-15T00:00:00.000Z");
    const names = await readTokenNames(db, "base", ["0xAAA", "0xbbb", "0xccc"]);
    expect(names.get("0xaaa")).toBe("LOTTO");
    expect(names.has("0xbbb")).toBe(false);
    expect(names.has("0xccc")).toBe(false);
  });
})
