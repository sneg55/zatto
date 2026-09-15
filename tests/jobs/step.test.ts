import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { NansenClient } from "@/lib/nansen/client";
import { runScanStep } from "@/lib/jobs/step";
import { createJob, readJob, readScore, saveJobPlan } from "@/lib/db/queries";
import type { Candidate } from "@/lib/jobs/types";

const now = new Date("2026-09-15T12:00:00Z");
const buy = (wallet: string, i: number) => ({ chain: "base", wallet, token: "0xt" + i, tx: "0xtx" + wallet + i, ts: `2026-09-10T1${i % 9}:03:11.000Z`, usd: 10, price: 1 });
const cand = (wallet: string, n: number): Candidate => ({ wallet, buys: Array.from({ length: n }, (_, i) => buy(wallet, i)), buckets: [] });
const okTape = { status: 200, body: { data: [], pagination: { page: 1, per_page: 1000, is_last_page: true } } };
const okOhlcv = { status: 200, body: { token_address: "x", timeframe: "1m", truncated: false, data: [] } };

function client(db: ReturnType<typeof openTestDb>) {
  const f = fetchStub((url) => (url.endsWith("token-ohlcv") ? okOhlcv : okTape));
  return { f, c: new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 100_000, runId: "r1", sleep: async () => {} }) };
}

describe("runScanStep", () => {
  it("stops at the request budget, persists cursors, and finishes on later steps", async () => {
    const db = openTestDb();
    await createJob(db, { runId: "r1", chain: "base", source: "cron", status: "settled", now: now.toISOString() });
    await saveJobPlan(db, "r1", [cand("0xa", 3), cand("0xb", 3)], 100, now.toISOString());
    const { c } = client(db);
    const r1 = await runScanStep(db, c, "r1", now, { requests: 8, dbQueries: 10_000, seconds: 100 });
    expect(r1.done).toBe(false);
    const j1 = await readJob(db, "r1");
    expect(j1?.status).toBe("running");
    expect(j1?.lease_until).toBeNull();
    expect((j1?.cursor ?? 0) + (j1?.bucket_cursor ?? 0)).toBeGreaterThan(0);
    let done = false;
    for (let i = 0; i < 20 && !done; i++) done = (await runScanStep(db, client(db).c, "r1", now, { requests: 8, dbQueries: 10_000, seconds: 100 })).done;
    expect(done).toBe(true);
    const j = await readJob(db, "r1");
    expect(j?.status).toBe("done");
    expect(j?.published).toBe(1);
    const scores = (await db.prepare("SELECT wallet FROM scores WHERE run_id = 'r1' ORDER BY wallet").all<{ wallet: string }>()).results.map((r) => r.wallet);
    expect(scores).toEqual(["0xa", "0xb"]);
  });

  it("refuses to run when another holder has the lease and skips dropped candidates", async () => {
    const db = openTestDb();
    await createJob(db, { runId: "r2", chain: "base", source: "cron", status: "settled", now: now.toISOString() });
    await saveJobPlan(db, "r2", [{ ...cand("0xa", 1), dropped: "over cap" }, cand("0xb", 1)], 10, now.toISOString());
    await db.prepare("UPDATE scan_jobs SET lease_until = ? WHERE run_id = 'r2'").bind("2026-09-15T12:00:30.000Z").run();
    const r = await runScanStep(db, client(db).c, "r2", now, { requests: 100, dbQueries: 10_000, seconds: 100 });
    expect(r.done).toBe(false);
    expect(r.failed).toMatch(/lease/);
    await db.prepare("UPDATE scan_jobs SET lease_until = NULL WHERE run_id = 'r2'").run();
    const r2 = await runScanStep(db, client(db).c, "r2", now, { requests: 100, dbQueries: 10_000, seconds: 100 });
    expect(r2.done).toBe(true);
    const scores = (await db.prepare("SELECT wallet FROM scores WHERE run_id = 'r2'").all<{ wallet: string }>()).results.map((r) => r.wallet);
    expect(scores).toEqual(["0xb"]);
  });

  it("marks the job failed on a Nansen 403", async () => {
    const db = openTestDb();
    await createJob(db, { runId: "r3", chain: "base", source: "paid", status: "settled", now: now.toISOString() });
    await saveJobPlan(db, "r3", [cand("0xa", 1)], 10, now.toISOString());
    const f = fetchStub([{ status: 403, body: { message: "credits" } }]);
    const c = new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 100_000, sleep: async () => {} });
    const r = await runScanStep(db, c, "r3", now, { requests: 100, dbQueries: 10_000, seconds: 100 });
    expect(r.failed).toMatch(/403/);
    expect((await readJob(db, "r3"))?.status).toBe("failed");
  });

  it("cleans up the scratch row for a wallet that was mid-progress when the job failed terminally", async () => {
    const db = openTestDb();
    await createJob(db, { runId: "r4", chain: "base", source: "paid", status: "settled", now: now.toISOString() });
    await saveJobPlan(db, "r4", [cand("0xa", 2)], 10, now.toISOString());
    const f = fetchStub((url) => (url.endsWith("tgm/dex-trades") ? okTape : { status: 403, body: { message: "credits" } }));
    const c = new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 100_000, sleep: async () => {} });
    await db.prepare("INSERT INTO scores (chain, wallet, run_id, computed_at, provisional, result) VALUES ('base','0xa','zatto:scored:r4:0xa',?,1,'[]')").bind(now.toISOString()).run();
    const r = await runScanStep(db, c, "r4", now, { requests: 100, dbQueries: 10_000, seconds: 100 });
    expect(r.failed).toMatch(/403/);
    const leftover = await db.prepare("SELECT * FROM scores WHERE run_id LIKE 'zatto:scored:r4:%'").all();
    expect(leftover.results.length).toBe(0);
  });

  it("never surfaces a scratch row as the latest real score for a wallet", async () => {
    const db = openTestDb();
    await db.prepare("INSERT INTO scores (chain, wallet, run_id, computed_at, provisional, result) VALUES ('base','0xa','r0','2026-09-15T10:00:00.000Z',0,'{\"verdict\":\"QUIET\"}')").run();
    await db.prepare("INSERT INTO scores (chain, wallet, run_id, computed_at, provisional, result) VALUES ('base','0xa','zatto:scored:r1:0xa','2026-09-15T12:00:00.000Z',1,'[]')").run();
    const latest = await readScore(db, "base", "0xa", null);
    expect(latest?.runId).toBe("r0");
  });
});
