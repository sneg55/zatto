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
});
