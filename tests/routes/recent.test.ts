import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { handleRecent } from "@/lib/recent";
import type { AppContext } from "@/lib/http/context";

const W = "0x" + "b".repeat(40);
const trade = (ts: string, who: string, tx: string) => ({ block_timestamp: ts, transaction_hash: tx, trader_address: who, trader_address_label: null, action: "BUY", estimated_swap_price_usd: 1, estimated_value_usd: 5 });

describe("recent", () => {
  it("returns buyers after the newest buy, deduplicated by tx, with provisional status", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-15T12:10:00Z");
    await db.prepare("INSERT INTO buys (chain, wallet, token, tx, ts, usd, price, fetched_at) VALUES (?,?,?,?,?,?,?,?)").bind("base", W, "0xt", "0xown", "2026-09-15T12:05:00.000Z", 10, 1, now.toISOString()).run();
    await db.prepare("INSERT INTO wallet_fetch (chain, wallet, last_fetched) VALUES (?,?,?)").bind("base", W, now.toISOString()).run();
    const f = fetchStub([{ status: 200, body: { data: [trade("2026-09-15T12:04:00Z", "0xearly", "0x0"), trade("2026-09-15T12:05:30Z", "0xf1", "0x1"), trade("2026-09-15T12:05:30Z", "0xf1", "0x1"), trade("2026-09-15T12:06:00Z", "0xf2", "0x2")], pagination: { is_last_page: true } } }, { status: 200, body: { data: [], pagination: { is_last_page: true } } }]);
    const c: AppContext = { db, env: { DB: db, NANSEN_API_KEY: "k", X402_PAY_TO: "0x1", INTERNAL_SECRET: "s", FACILITATOR_URL: "https://f", DAILY_CREDIT_BUDGET: "3000", RUN_REQUEST_CAP: "600", LIVE_WALLET_PER_IP_PER_HOUR: "10", LIVE_WALLET_CONCURRENCY: "2", PUBLIC_BASE_URL: "https://z.test" }, now: () => now, fetch: f, waitUntil: () => {} };
    const j = await (await handleRecent(c, "base", W, "1.1.1.1")).json() as { buyers: Array<{ address: string; secondsAfter: number }>; status: string };
    expect(j.buyers.map((b) => [b.address, b.secondsAfter])).toEqual([["0xf1", 30], ["0xf2", 60]]);
    expect(j.status).toBe("provisional");
  });

  it("refuses an address with no buys on record without spending a Nansen call", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-15T12:10:00Z");
    const f = fetchStub([{ status: 200, body: { data: [], pagination: { is_last_page: true } } }]);
    const c: AppContext = { db, env: { DB: db, NANSEN_API_KEY: "k", X402_PAY_TO: "0x1", INTERNAL_SECRET: "s", FACILITATOR_URL: "https://f", DAILY_CREDIT_BUDGET: "3000", RUN_REQUEST_CAP: "600", LIVE_WALLET_PER_IP_PER_HOUR: "10", LIVE_WALLET_CONCURRENCY: "2", PUBLIC_BASE_URL: "https://z.test" }, now: () => now, fetch: f, waitUntil: () => {} };
    const r = await handleRecent(c, "base", "0x" + "c".repeat(40), "7.7.7.7");
    expect(r.status).toBe(404);
    expect(((await r.json()) as { reason: string }).reason).toMatch(/no buys on record/);
    expect(f.calls.length).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM calls").first<{ n: number }>())?.n).toBe(0);
  });

  it("refuses over the per-ip limit and keeps its own counter apart from the live wallet one", async () => {
    const db = openTestDb();
    const now = new Date("2026-09-15T12:10:00Z");
    const f = fetchStub([{ status: 200, body: { data: [], pagination: { is_last_page: true } } }]);
    const c: AppContext = { db, env: { DB: db, NANSEN_API_KEY: "k", X402_PAY_TO: "0x1", INTERNAL_SECRET: "s", FACILITATOR_URL: "https://f", DAILY_CREDIT_BUDGET: "3000", RUN_REQUEST_CAP: "600", LIVE_WALLET_PER_IP_PER_HOUR: "2", LIVE_WALLET_CONCURRENCY: "2", PUBLIC_BASE_URL: "https://z.test" }, now: () => now, fetch: f, waitUntil: () => {} };
    const { sha256Hex } = await import("@/lib/jobs/leases");
    await db.prepare("INSERT INTO ip_counters (ip_hash, hour, count) VALUES (?,?,?)").bind(await sha256Hex("recent:8.8.8.8"), "2026-09-15T12", 2).run();
    const r = await handleRecent(c, "base", W, "8.8.8.8");
    expect(r.status).toBe(429);
    expect(((await r.json()) as { reason: string }).reason).toBe("per-ip limit");
    expect(f.calls.length).toBe(0);
    const live = await db.prepare("SELECT count FROM ip_counters WHERE ip_hash = ?").bind(await sha256Hex("8.8.8.8")).first<{ count: number }>();
    expect(live).toBeNull();
  });
});
