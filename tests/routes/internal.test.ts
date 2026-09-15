import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { handleInternalStep } from "@/lib/http/internal";
import { createJob, readJob, saveJobPlan } from "@/lib/db/queries";
import type { AppContext } from "@/lib/http/context";

function ctx(db: ReturnType<typeof openTestDb>): AppContext & { triggered: string[] } {
  const triggered: string[] = [];
  const f = fetchStub((url) => url.includes("scan-step") ? (triggered.push(url), { status: 200, body: {} }) : url.endsWith("token-ohlcv") ? { status: 200, body: { token_address: "x", timeframe: "1m", truncated: false, data: [] } } : { status: 200, body: { data: [], pagination: { page: 1, per_page: 1000, is_last_page: true } } });
  return { db, env: { DB: db, NANSEN_API_KEY: "k", X402_PAY_TO: "0x1", INTERNAL_SECRET: "s".repeat(64), FACILITATOR_URL: "https://f", DAILY_CREDIT_BUDGET: "3000", RUN_REQUEST_CAP: "600", LIVE_WALLET_PER_IP_PER_HOUR: "10", LIVE_WALLET_CONCURRENCY: "2", PUBLIC_BASE_URL: "https://z.test" }, now: () => new Date("2026-09-15T12:00:00Z"), fetch: f, waitUntil: (p) => { void p; }, triggered };
}
const req = (secret: string | null, body: unknown) => new Request("https://z.test/api/internal/scan-step", { method: "POST", headers: secret ? { "X-Zatto-Internal": secret, "content-type": "application/json" } : { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("internal scan-step", () => {
  it("404s without the secret, with a wrong secret, and with an unknown run", async () => {
    const c = ctx(openTestDb());
    expect((await handleInternalStep(c, req(null, { run_id: "x" }))).status).toBe(404);
    expect((await handleInternalStep(c, req("t".repeat(64), { run_id: "x" }))).status).toBe(404);
    expect((await handleInternalStep(c, req("s".repeat(64), { run_id: "nope" }))).status).toBe(404);
  });
  it("ignores caller-supplied cursors, runs a step from stored state, and re-triggers until done", async () => {
    const db = openTestDb(); const c = ctx(db);
    await createJob(db, { runId: "r1", chain: "base", source: "cron", status: "settled", now: "2026-09-15T12:00:00.000Z" });
    await saveJobPlan(db, "r1", [{ wallet: "0xa", buys: [{ chain: "base", wallet: "0xa", token: "0xt", tx: "0x1", ts: "2026-09-10T10:00:00.000Z", usd: 1, price: 1 }], buckets: [] }], 10, "2026-09-15T12:00:00.000Z");
    const res = await handleInternalStep(c, req("s".repeat(64), { run_id: "r1", cursor: 99, bucket_cursor: 99 }));
    expect(res.status).toBe(200);
    expect((await readJob(db, "r1"))?.status).toBe("done");
    expect(c.triggered.length).toBe(0);
  });
});
