import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { handleLiveWallet } from "@/lib/liveWallet";
import type { AppContext } from "@/lib/http/context";

const W = "0x" + "a".repeat(40);
function ctx(db: ReturnType<typeof openTestDb>, budget = "3000"): AppContext {
  const f = fetchStub((url) => url.endsWith("profiler/dex-trades") ? { status: 200, body: { data: [], pagination: { page: 1, per_page: 100, is_last_page: true } } } : { status: 200, body: { data: [], pagination: { is_last_page: true } } });
  return { db, env: { DB: db, NANSEN_API_KEY: "k", X402_PAY_TO: "0x1", INTERNAL_SECRET: "s", FACILITATOR_URL: "https://f", DAILY_CREDIT_BUDGET: budget, RUN_REQUEST_CAP: "600", LIVE_WALLET_PER_IP_PER_HOUR: "2", LIVE_WALLET_CONCURRENCY: "1", PUBLIC_BASE_URL: "https://z.test" }, now: () => new Date("2026-09-15T12:00:00Z"), fetch: f, waitUntil: () => {} };
}

describe("live wallet", () => {
  it("400 on bad input, THIN result on a wallet with no buys, cached within an hour", async () => {
    const db = openTestDb(); const c = ctx(db);
    expect((await handleLiveWallet(c, "base", "0x12", "1.1.1.1")).status).toBe(400);
    const r = await handleLiveWallet(c, "base", W, "1.1.1.1");
    const j = await r.json() as { score: { verdict: string }; stale: boolean };
    expect(j.score.verdict).toBe("THIN"); expect(j.stale).toBe(false);
    const r2 = await handleLiveWallet(c, "base", W, "1.1.1.1");
    expect(((await r2.json()) as { stale: boolean }).stale).toBe(false);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM calls").first<{ n: number }>())?.n).toBe(1);
  });
  it("per-ip limit and busy slot return stale with a reason", async () => {
    const db = openTestDb(); const c = ctx(db);
    await db.prepare("INSERT INTO ip_counters (ip_hash, hour, count) VALUES (?,?,?)").bind(await (await import("@/lib/jobs/leases")).sha256Hex("2.2.2.2"), "2026-09-15T12", 2).run();
    const r = await handleLiveWallet(c, "base", W, "2.2.2.2");
    expect(r.status).toBe(429); expect(((await r.json()) as { reason: string }).reason).toBe("per-ip limit");
    await db.prepare("INSERT INTO live_leases (key, lease_until) VALUES ('live-0', '2026-09-15T12:00:30.000Z')").run();
    const b = await handleLiveWallet(c, "base", W, "3.3.3.3");
    expect(b.status).toBe(503); expect(((await b.json()) as { reason: string }).reason).toBe("busy");
  });
  it("budget exhausted returns stale with the reason", async () => {
    const db = openTestDb(); const c = ctx(db, "0");
    const r = await handleLiveWallet(c, "base", W, "4.4.4.4");
    expect(r.status).toBe(503); expect(((await r.json()) as { reason: string }).reason).toBe("daily budget exhausted");
  });
});
