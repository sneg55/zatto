import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { RESERVATION_GRACE_MS, sweep } from "@/lib/jobs/sweeper";
import { createJob, readJob, saveJobProgress } from "@/lib/db/queries";
import { LEASE_SECONDS, PLAN_LEASE_SECONDS } from "@/lib/jobs/leases";
import { DEFAULT_BUDGETS } from "@/lib/jobs/types";

describe("sweep", () => {
  it("resumes expired leases, fails at the attempt limit, and creates the cron job on schedule", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-15T12:03:00Z");
    await createJob(db, { runId: "old", chain: "base", source: "cron", status: "settled", now: "2026-09-15T00:00:00.000Z" });
    await db.prepare("UPDATE scan_jobs SET status = 'running', lease_until = '2026-09-15T11:00:00.000Z', attempts = 4 WHERE run_id = 'old'").run();
    await createJob(db, { runId: "stuck", chain: "base", source: "paid", status: "settled", now: "2026-09-15T11:50:00.000Z" });
    await db.prepare("UPDATE scan_jobs SET status = 'running', lease_until = '2026-09-15T11:55:00.000Z', attempts = 1 WHERE run_id = 'stuck'").run();
    const triggered: string[] = [];
    const r = await sweep(db, { chains: ["base"], cronHoursUtc: [0, 6, 12, 18], maxAttempts: 5 }, now, async (id) => { triggered.push(id); });
    expect(r.resumed).toEqual(["stuck"]);
    expect(r.failed).toEqual(["old"]);
    expect((await readJob(db, "old"))?.status).toBe("failed");
    expect((await readJob(db, "old"))?.error).toBe("step limit");
    expect((await readJob(db, "stuck"))?.attempts).toBe(2);
    expect(r.created).toMatch(/^cron-base-/);
    expect(triggered).toEqual(["stuck", r.created]);
    const again = await sweep(db, { chains: ["base"], cronHoursUtc: [0, 6, 12, 18], maxAttempts: 5 }, new Date("2026-09-15T12:08:00Z"), async () => {});
    expect(again.created).toBeNull();
  });

  it("does not hide a job at the attempt boundary from the failure verdict", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-15T12:03:00Z");
    await createJob(db, { runId: "boundary", chain: "base", source: "cron", status: "settled", now: "2026-09-15T00:00:00.000Z" });
    await db.prepare("UPDATE scan_jobs SET status = 'running', lease_until = '2026-09-15T11:00:00.000Z', attempts = 4 WHERE run_id = 'boundary'").run();
    const r = await sweep(db, { chains: [], cronHoursUtc: [], maxAttempts: 5 }, now, async () => {});
    expect(r.resumed).toEqual([]);
    expect(r.failed).toEqual(["boundary"]);
  });

  it("a job that alternates progress with a transient failure is never killed at the attempt limit", async () => {
    const db = openTestDb();
    const cfg = { chains: [], cronHoursUtc: [], maxAttempts: 5 };
    await createJob(db, { runId: "slow", chain: "base", source: "cron", status: "settled", now: "2026-09-15T00:00:00.000Z" });
    await db.prepare("UPDATE scan_jobs SET status = 'running' WHERE run_id = 'slow'").run();
    let cursor = 0;
    for (let tick = 0; tick < 14; tick++) {
      await db.prepare("UPDATE scan_jobs SET lease_until = '2026-09-15T11:00:00.000Z' WHERE run_id = 'slow'").run();
      const r = await sweep(db, cfg, new Date(Date.parse("2026-09-15T12:00:00Z") + tick * 300_000), async () => {});
      expect(r.failed).toEqual([]);
      expect(r.resumed).toEqual(["slow"]);
      if (tick % 2 === 1) await saveJobProgress(db, "slow", ++cursor, 0, tick);
    }
    expect((await readJob(db, "slow"))?.status).toBe("running");
    expect((await readJob(db, "slow"))?.attempts).toBeLessThan(5);
  });

  it("saving progress resets attempts only when a cursor advanced", async () => {
    const db = openTestDb();
    await createJob(db, { runId: "p", chain: "base", source: "cron", status: "settled", now: "2026-09-15T00:00:00.000Z" });
    await db.prepare("UPDATE scan_jobs SET attempts = 3, cursor = 2, bucket_cursor = 4 WHERE run_id = 'p'").run();
    await saveJobProgress(db, "p", 2, 4, 10);
    expect((await readJob(db, "p"))?.attempts).toBe(3);
    await saveJobProgress(db, "p", 2, 5, 11);
    expect((await readJob(db, "p"))?.attempts).toBe(0);
    await db.prepare("UPDATE scan_jobs SET attempts = 3 WHERE run_id = 'p'").run();
    await saveJobProgress(db, "p", 3, 0, 12);
    expect((await readJob(db, "p"))?.attempts).toBe(0);
  });

  it("creates the cron job on a later tick when the one at the top of the hour was missed", async () => {
    const db = openTestDb();
    const cfg = { chains: ["base"], cronHoursUtc: [0, 6, 12, 18], maxAttempts: 5 };
    const r = await sweep(db, cfg, new Date("2026-09-15T12:37:00Z"), async () => {});
    expect(r.created).toMatch(/^cron-base-/);
    const again = await sweep(db, cfg, new Date("2026-09-15T12:42:00Z"), async () => {});
    expect(again.created).toBeNull();
    const nextWindow = await sweep(db, cfg, new Date("2026-09-15T18:02:00Z"), async () => {});
    expect(nextWindow.created).toMatch(/^cron-base-/);
  });
});

describe("lease length", () => {
  it("covers a planning step, which runs its whole discovery budget before it can yield", () => {
    expect(PLAN_LEASE_SECONDS).toBeGreaterThan(DEFAULT_BUDGETS.planRequests * 5);
  });

  it("keeps the scoring lease near the step budget, so a worker that dies does not park the run", () => {
    expect(LEASE_SECONDS).toBeGreaterThan(DEFAULT_BUDGETS.seconds);
    expect(LEASE_SECONDS).toBeLessThan(PLAN_LEASE_SECONDS / 2);
  });
});

describe("stranded credit reservations", () => {
  it("reclaims a reservation whose worker died, and leaves a call still in flight alone", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-15T23:20:00.000Z");
    const dead = new Date(now.getTime() - RESERVATION_GRACE_MS - 60_000).toISOString();
    const live = new Date(now.getTime() - 30_000).toISOString();
    await db.prepare("INSERT INTO calls (ts, endpoint, credits, run_id, status) VALUES (?,?,?,?,?)").bind(dead, "tgm/dex-trades", 1, "r", "reserved").run();
    await db.prepare("INSERT INTO calls (ts, endpoint, credits, run_id, status) VALUES (?,?,?,?,?)").bind(live, "tgm/dex-trades", 1, "r", "reserved").run();
    await db.prepare("INSERT INTO calls (ts, endpoint, credits, run_id, status) VALUES (?,?,?,?,?)").bind(dead, "tgm/dex-trades", 1, "r", "ok").run();

    const result = await sweep(db, { chains: [], cronHoursUtc: [], maxAttempts: 5 }, now, async () => {});

    expect(result.reclaimed).toBe(1);
    const left = await db.prepare("SELECT status, COUNT(*) c FROM calls GROUP BY status").all<{ status: string; c: number }>();
    expect(Object.fromEntries(left.results.map((r) => [r.status, r.c]))).toEqual({ ok: 1, reserved: 1 });
  });
});
