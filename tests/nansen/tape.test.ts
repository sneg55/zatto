import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { NansenClient } from "@/lib/nansen/client";
import { getTape } from "@/lib/nansen/tape";

const trade = (ts: string, who: string) => ({ block_timestamp: ts, transaction_hash: "0x" + who, trader_address: who, trader_address_label: null, action: "BUY", estimated_swap_price_usd: 1, estimated_value_usd: 10 });
const page = (rows: unknown[], isLast: boolean) => ({ status: 200, body: { data: rows, pagination: { page: 1, per_page: 1000, is_last_page: isLast } } });
const client = (db: ReturnType<typeof openTestDb>, f: typeof fetch, now: Date) => new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 3000, sleep: async () => {} });

describe("getTape", () => {
  it("fetches once, stores compact rows, and is final when exhausted after maturity", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-10T16:00:00Z");
    const f = fetchStub([page([trade("2026-09-10T14:03:11Z", "0xa")], true)]);
    const b = await getTape(db, client(db, f, now), "base", "0xtok", "2026-09-10T14", now, "score");
    expect(b.final).toBe(true); expect(b.rows[0]).toEqual(["2026-09-10T14:03:11.000Z", "0xa", "BUY", 10, 1, "0x0xa", null]);
    const again = await getTape(db, client(db, f, now), "base", "0xtok", "2026-09-10T14", now, "score");
    expect(again.final).toBe(true); expect(f.calls.length).toBe(1);
  });
  it("is not matured when fetched under 15 minutes after the hour ends, and refetches after maturity", async () => {
    const db = openTestDb();
    const early = new Date("2026-09-10T15:05:00Z");
    const f = fetchStub([page([trade("2026-09-10T14:03:11Z", "0xa")], true), page([trade("2026-09-10T14:03:11Z", "0xa"), trade("2026-09-10T14:59:59Z", "0xb")], true)]);
    const b1 = await getTape(db, client(db, f, early), "base", "0xtok", "2026-09-10T14", early, "score");
    expect(b1.final).toBe(false);
    const late = new Date("2026-09-10T15:30:00Z");
    const b2 = await getTape(db, client(db, f, late), "base", "0xtok", "2026-09-10T14", late, "score");
    expect(b2.final).toBe(true); expect(b2.rows.length).toBe(2); expect(f.calls.length).toBe(2);
  });
  it("marks capped after 3 pages and never final", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-10T16:00:00Z");
    const rows = Array.from({ length: 1000 }, (_, i) => trade("2026-09-10T14:00:01Z", "0x" + i));
    const f = fetchStub([page(rows, false), page(rows, false), page(rows, false), page(rows, false)]);
    const b = await getTape(db, client(db, f, now), "base", "0xtok", "2026-09-10T14", now, "score");
    expect(b.capped).toBe(true); expect(b.final).toBe(false); expect(f.calls.length).toBe(3);
  });
  it("respects the 10 minute and 60 second refetch rules for the current hour", async () => {
    const db = openTestDb();
    const t1 = new Date("2026-09-10T14:10:00Z");
    const f = fetchStub([page([], true), page([trade("2026-09-10T14:10:30Z", "0xa")], true), page([trade("2026-09-10T14:10:30Z", "0xa")], true)]);
    await getTape(db, client(db, f, t1), "base", "0xtok", "2026-09-10T14", t1, "score");
    const t2 = new Date("2026-09-10T14:15:00Z");
    const b = await getTape(db, client(db, f, t2), "base", "0xtok", "2026-09-10T14", t2, "score");
    expect(b.rows.length).toBe(0); expect(f.calls.length).toBe(1);
    const r = await getTape(db, client(db, f, t2), "base", "0xtok", "2026-09-10T14", t2, "recent");
    expect(r.rows.length).toBe(1); expect(f.calls.length).toBe(2);
    const t3 = new Date("2026-09-10T14:21:00Z");
    await getTape(db, client(db, f, t3), "base", "0xtok", "2026-09-10T14", t3, "score");
    expect(f.calls.length).toBe(3);
  });
  it("a second caller waits for the lock holder and reads the stored bucket", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-10T16:00:00Z");
    await db.prepare("INSERT INTO tape_lock (chain, token, hour, lease_until) VALUES (?,?,?,?)").bind("base", "0xtok", "2026-09-10T14", "2026-09-10T16:00:30.000Z").run();
    const f = fetchStub([page([trade("2026-09-10T14:03:11Z", "0xa")], true)]);
    setTimeout(async () => { await db.prepare("DELETE FROM tape_lock").run(); }, 50);
    const waits: number[] = [];
    const b = await getTape(db, client(db, f, now), "base", "0xtok", "2026-09-10T14", now, "score", async (ms) => { waits.push(ms); await new Promise((r) => setTimeout(r, 60)); });
    expect(b.rows.length).toBe(1);
  });
});
