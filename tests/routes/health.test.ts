import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { buildHealth } from "@/lib/health";

describe("health", () => {
  it("reports budget state from calls rows", async () => {
    const db = openTestDb();
    await db.prepare("INSERT INTO calls (ts, endpoint, credits, status) VALUES (?,?,?,?)").bind("2026-09-15T01:00:00.000Z", "tgm/dex-trades", 2999, "ok").run();
    const h = await buildHealth(db, { DAILY_CREDIT_BUDGET: "3000" }, new Date("2026-09-15T02:00:00Z"));
    expect(h.budget_exhausted).toBe(false);
    await db.prepare("INSERT INTO calls (ts, endpoint, credits, status) VALUES (?,?,?,?)").bind("2026-09-15T01:30:00.000Z", "tgm/dex-trades", 1, "reserved").run();
    const h2 = await buildHealth(db, { DAILY_CREDIT_BUDGET: "3000" }, new Date("2026-09-15T02:00:00Z"));
    expect(h2.budget_exhausted).toBe(true);
    expect(h2.lifetime_ok_calls).toBe(1);
  });
});
