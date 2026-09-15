import { describe, it, expect, vi } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { LIVE_MAX_THROTTLE_MS, NansenClient } from "@/lib/nansen/client";
import { BudgetExhaustedError } from "@/lib/nansen/credits";

const now = () => new Date("2026-09-15T10:00:00Z");

describe("NansenClient", () => {
  it("sends the apikey header and records a reserved then ok row with rate headers", async () => {
    const db = openTestDb();
    const f = fetchStub([{ status: 200, body: { data: [1] }, headers: { "X-RateLimit-Remaining-Minute": "250", "X-RateLimit-Remaining-Second": "14" } }]);
    const c = new NansenClient({ db, apiKey: "k", fetch: f, now, budget: 3000, runId: "r1" });
    const r = await c.post<{ data: number[] }>("tgm/dex-trades", { chain: "base" });
    expect(r.data.data).toEqual([1]);
    expect((f.calls[0].init.headers as Record<string, string>)["apikey"]).toBe("k");
    expect(f.calls[0].url).toBe("https://api.nansen.ai/api/v1/tgm/dex-trades");
    const row = await db.prepare("SELECT status, credits, run_id, remaining_minute FROM calls").first<{ status: string; credits: number; run_id: string; remaining_minute: number }>();
    expect(row).toEqual({ status: "ok", credits: 1, run_id: "r1", remaining_minute: 250 });
  });
  it("refuses when the reservation would exceed the budget", async () => {
    const db = openTestDb();
    await db.prepare("INSERT INTO calls (ts, endpoint, credits, status) VALUES (?,?,?,?)").bind("2026-09-15T01:00:00.000Z", "x", 3000, "ok").run();
    const c = new NansenClient({ db, apiKey: "k", fetch: fetchStub([{ status: 200, body: {} }]), now, budget: 3000 });
    await expect(c.post("tgm/dex-trades", {})).rejects.toBeInstanceOf(BudgetExhaustedError);
  });
  it("marks failed on 4xx other than 429 and throws", async () => {
    const db = openTestDb();
    const c = new NansenClient({ db, apiKey: "k", fetch: fetchStub([{ status: 403, body: { message: "no" } }]), now, budget: 3000 });
    await expect(c.post("tgm/dex-trades", {})).rejects.toThrow(/403/);
    const row = await db.prepare("SELECT status FROM calls").first<{ status: string }>();
    expect(row?.status).toBe("failed");
  });
  it("retries once on 429 honouring Retry-After and once on 5xx", async () => {
    const db = openTestDb();
    const sleep = vi.fn(async () => {});
    const f = fetchStub([{ status: 429, body: {}, headers: { "Retry-After": "2" } }, { status: 200, body: { ok: true } }]);
    const c = new NansenClient({ db, apiKey: "k", fetch: f, now, budget: 3000, sleep });
    const r = await c.post<{ ok: boolean }>("tgm/dex-trades", {});
    expect(r.data.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(2000);
    const rows = (await db.prepare("SELECT status FROM calls ORDER BY id").all<{ status: string }>()).results.map((r) => r.status);
    expect(rows).toEqual(["failed", "ok"]);
    const g = fetchStub([{ status: 500, body: {} }, { status: 500, body: {} }]);
    const c2 = new NansenClient({ db, apiKey: "k", fetch: g, now, budget: 3000, sleep });
    await expect(c2.post("tgm/dex-trades", {})).rejects.toThrow(/500/);
    expect(g.calls.length).toBe(2);
  });
  it("sleeps before a call when the last stored minute remaining is under 20", async () => {
    const db = openTestDb();
    await db.prepare("INSERT INTO calls (ts, endpoint, credits, status, remaining_minute) VALUES (?,?,?,?,?)").bind("2026-09-15T09:59:50.000Z", "x", 1, "ok", 5).run();
    const sleep = vi.fn(async () => {});
    const c = new NansenClient({ db, apiKey: "k", fetch: fetchStub([{ status: 200, body: {} }]), now, budget: 3000, sleep });
    await c.post("tgm/dex-trades", {});
    expect(sleep).toHaveBeenCalledWith(50_000);
  });
  it("caps the throttle sleep when a caller sets a maximum, so a user-facing request is not held for a minute", async () => {
    const db = openTestDb();
    await db.prepare("INSERT INTO calls (ts, endpoint, credits, status, remaining_minute) VALUES (?,?,?,?,?)").bind("2026-09-15T09:59:50.000Z", "x", 1, "ok", 5).run();
    const sleep = vi.fn(async () => {});
    const c = new NansenClient({ db, apiKey: "k", fetch: fetchStub([{ status: 200, body: {} }]), now, budget: 3000, sleep, maxThrottleMs: LIVE_MAX_THROTTLE_MS });
    await c.post("tgm/dex-trades", {});
    expect(sleep).toHaveBeenCalledWith(LIVE_MAX_THROTTLE_MS);
  });
});
