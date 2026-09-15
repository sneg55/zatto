import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { NansenClient } from "@/lib/nansen/client";
import { getCloses } from "@/lib/nansen/candles";

const c = (db: ReturnType<typeof openTestDb>, f: typeof fetch, now: Date) => new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 3000, sleep: async () => {} });

describe("getCloses", () => {
  it("fetches the covering range once, marks past minutes final, records missing and pending gaps", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-10T15:00:00Z");
    const f = fetchStub([{ status: 200, body: { token_address: "0xtok", timeframe: "1m", truncated: false, data: [{ timestamp: "2026-09-10T14:03:00Z", close: 1 }, { timestamp: "2026-09-10T14:04:00Z", close: 1.05 }] } }]);
    const m = await getCloses(db, c(db, f, now), "base", "0xtok", ["2026-09-10T14:03", "2026-09-10T14:04", "2026-09-10T14:05", "2026-09-11T14:03"], now);
    expect(m.get("2026-09-10T14:03")).toEqual({ close: 1, final: true });
    expect(m.has("2026-09-10T14:05")).toBe(false);
    const gaps = (await db.prepare("SELECT minute, reason FROM candle_gap ORDER BY minute").all<{ minute: string; reason: string }>()).results;
    expect(gaps).toEqual([{ minute: "2026-09-10T14:05", reason: "missing" }, { minute: "2026-09-11T14:03", reason: "pending" }]);
    await getCloses(db, c(db, f, now), "base", "0xtok", ["2026-09-10T14:03"], now);
    expect(f.calls.length).toBe(1);
  });
  it("records truncated gaps when the response says so", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-10T15:00:00Z");
    const f = fetchStub([{ status: 200, body: { token_address: "0xtok", timeframe: "1m", truncated: true, truncation_note: "cap", data: [] } }]);
    await getCloses(db, c(db, f, now), "base", "0xtok", ["2026-09-10T14:03"], now);
    const g = await db.prepare("SELECT reason FROM candle_gap").first<{ reason: string }>();
    expect(g?.reason).toBe("truncated");
  });

  it("writes only the requested minutes when the response carries the whole 24 hour range", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-12T15:00:00Z");
    const t0 = Date.parse("2026-09-10T14:03:00Z");
    const data = Array.from({ length: 1441 }, (_, i) => ({ timestamp: new Date(t0 + i * 60_000).toISOString(), close: 1 + i / 1000 }));
    const f = fetchStub([{ status: 200, body: { token_address: "0xtok", timeframe: "1m", truncated: false, data } }]);
    const wanted = ["2026-09-10T14:03", "2026-09-10T14:04", "2026-09-10T15:03", "2026-09-11T14:03"];
    const m = await getCloses(db, c(db, f, now), "base", "0xtok", wanted, now);
    const stored = (await db.prepare("SELECT minute FROM candles ORDER BY minute").all<{ minute: string }>()).results.map((r) => r.minute);
    expect(stored).toEqual(wanted);
    expect(m.size).toBe(4);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM candle_gap").first<{ n: number }>())?.n).toBe(0);
  });

  it("reads the real candle shape, keyed on interval_start, and writes no gap", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-15T15:00:00Z");
    const f = fetchStub([{ status: 200, body: { token_address: "0xtok", timeframe: "1m", truncated: false, data: [{ interval_start: "2026-09-15T14:23:00Z", open: 145.9, high: 146.3, low: 145.7, close: 146.1, volume: null, volume_usd: 146.1, market_cap: { open: 1, high: 1, low: 1, close: 1 } }] } }]);
    const m = await getCloses(db, c(db, f, now), "base", "0xtok", ["2026-09-15T14:23"], now);
    expect(m.get("2026-09-15T14:23")).toEqual({ close: 146.1, final: true });
    const gaps = (await db.prepare("SELECT COUNT(*) AS n FROM candle_gap").first<{ n: number }>())?.n;
    expect(gaps).toBe(0);
  });

  it("records a missing gap instead of throwing when a candle carries no readable timestamp", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-10T15:00:00Z");
    const f = fetchStub([{ status: 200, body: { token_address: "0xtok", timeframe: "1m", truncated: false, data: [{ opened_at: "2026-09-10T14:03:00Z", close: 1 }] } }]);
    const m = await getCloses(db, c(db, f, now), "base", "0xtok", ["2026-09-10T14:03"], now);
    expect(m.size).toBe(0);
    const g = await db.prepare("SELECT minute, reason FROM candle_gap").first<{ minute: string; reason: string }>();
    expect(g).toEqual({ minute: "2026-09-10T14:03", reason: "missing" });
  });
});
