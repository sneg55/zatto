import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { openTestDb } from "../helpers/d1";
import { handlePaidScan, resetHttpServerCache } from "@/lib/x402/server";
import { readJob } from "@/lib/db/queries";
import type { AppContext } from "@/lib/http/context";

const payload = { x402Version: 2, accepted: {}, payload: { authorization: { from: "0xPAYER", nonce: "0xn1" }, signature: "0xsig" } };
function ctx(db: ReturnType<typeof openTestDb>) {
  const triggered: string[] = [];
  const c: AppContext & { triggered: string[] } = { db, env: { DB: db, NANSEN_API_KEY: "k", X402_PAY_TO: "0x1", INTERNAL_SECRET: "s", FACILITATOR_URL: "https://f", DAILY_CREDIT_BUDGET: "3000", RUN_REQUEST_CAP: "600", LIVE_WALLET_PER_IP_PER_HOUR: "10", LIVE_WALLET_CONCURRENCY: "2", PUBLIC_BASE_URL: "https://z.test" }, now: () => new Date("2026-09-15T12:00:00Z"), fetch: async (u) => { triggered.push(String(u)); return new Response("{}"); }, waitUntil: (p) => { void p; }, triggered };
  return c;
}
const PAY_TO = "0x1111111111111111111111111111111111111111";
function facilitatorStub(getSupported: () => Promise<unknown>) {
  return { getSupported, async verify() { return { isValid: false, invalidReason: "unsupported" }; }, async settle() { return { success: false, transaction: "", network: "eip155:8453" }; } } as never;
}
const supportsExactOnBase = () => facilitatorStub(async () => ({ kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }], extensions: [], signers: {} }));

const req = (sig?: string) => new NextRequest("https://z.test/api/scan/base", { method: "POST", headers: sig ? { "payment-signature": sig } : {} });
function server(script: { verified: boolean; settleOk: boolean }) {
  return {
    processHTTPRequest: async (c: { paymentHeader?: string }) => c.paymentHeader && script.verified
      ? { type: "payment-verified", paymentPayload: payload, paymentRequirements: { scheme: "exact", network: "eip155:8453", asset: "0xusdc", amount: "1000000", payTo: "0x1", maxTimeoutSeconds: 300, extra: {} }, cancellationDispatcher: { cancel: async () => null } }
      : { type: "payment-error", response: { status: 402, headers: { "PAYMENT-REQUIRED": "b64" }, body: { error: "payment required" } } },
    processSettlement: async () => script.settleOk
      ? { success: true, transaction: "0xtx", network: "eip155:8453", headers: { "PAYMENT-RESPONSE": "b64resp" }, requirements: {} }
      : { success: false, transaction: "", network: "eip155:8453", errorReason: "insufficient_funds", headers: {}, response: { status: 402, headers: {}, body: { error: "insufficient_funds" } } },
  } as never;
}

function throwingSettleServer() {
  return {
    processHTTPRequest: async (c: { paymentHeader?: string }) => c.paymentHeader
      ? { type: "payment-verified", paymentPayload: payload, paymentRequirements: { scheme: "exact", network: "eip155:8453", asset: "0xusdc", amount: "1000000", payTo: "0x1", maxTimeoutSeconds: 300, extra: {} }, cancellationDispatcher: { cancel: async () => null } }
      : { type: "payment-error", response: { status: 402, headers: {}, body: { error: "payment required" } } },
    processSettlement: async () => { throw new Error("facilitator timeout"); },
  } as never;
}

describe("paid scan", () => {
  it("returns 402 with the PAYMENT-REQUIRED header when unpaid and writes nothing", async () => {
    const db = openTestDb();
    const r = await handlePaidScan(ctx(db), req(), "base", server({ verified: false, settleOk: true }));
    expect(r.status).toBe(402); expect(r.headers.get("PAYMENT-REQUIRED")).toBe("b64");
    expect((await db.prepare("SELECT COUNT(*) AS n FROM scan_jobs").first<{ n: number }>())?.n).toBe(0);
  });
  it("verify, insert, settle, trigger, 202 with PAYMENT-RESPONSE; a retry of the same payment returns the same run", async () => {
    const db = openTestDb(); const c = ctx(db);
    const r = await handlePaidScan(c, req("sig"), "base", server({ verified: true, settleOk: true }));
    expect(r.status).toBe(202); expect(r.headers.get("PAYMENT-RESPONSE")).toBe("b64resp");
    const j = await r.json() as { run_id: string; payment_tx: string };
    expect(j.payment_tx).toBe("0xtx");
    expect((await readJob(db, j.run_id))?.status).toBe("settled");
    expect(c.triggered.some((u) => u.includes("scan-step"))).toBe(true);
    const again = await handlePaidScan(c, req("sig"), "base", server({ verified: true, settleOk: true }));
    expect(((await again.json()) as { run_id: string }).run_id).toBe(j.run_id);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM scan_jobs").first<{ n: number }>())?.n).toBe(1);
  });
  it("settlement failure marks the job failed and returns the settlement 402, nothing is triggered", async () => {
    const db = openTestDb(); const c = ctx(db);
    const r = await handlePaidScan(c, req("sig"), "base", server({ verified: true, settleOk: false }));
    expect(r.status).toBe(402);
    const job = await db.prepare("SELECT status, error FROM scan_jobs").first<{ status: string; error: string }>();
    expect(job?.status).toBe("failed"); expect(job?.error).toMatch(/insufficient_funds/);
    expect(c.triggered.length).toBe(0);
  });
  it("a facilitator throw during settlement marks the job failed and returns 503, nothing is triggered", async () => {
    const db = openTestDb(); const c = ctx(db);
    const r = await handlePaidScan(c, req("sig"), "base", throwingSettleServer());
    expect(r.status).toBe(503);
    const job = await db.prepare("SELECT status, error, payment_tx FROM scan_jobs").first<{ status: string; error: string; payment_tx: string | null }>();
    expect(job?.status).toBe("failed"); expect(job?.error).toBe("settlement facilitator unreachable"); expect(job?.payment_tx).toBeNull();
    expect(c.triggered.length).toBe(0);
  });
  it("a replay after a settlement throw does not present the orphaned job as a success", async () => {
    const db = openTestDb(); const c = ctx(db);
    await handlePaidScan(c, req("sig"), "base", throwingSettleServer());
    const replay = await handlePaidScan(c, req("sig"), "base", throwingSettleServer());
    expect(replay.status).not.toBe(202);
    const body = await replay.json() as { payment_tx?: string };
    expect(body.payment_tx).toBeUndefined();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM scan_jobs").first<{ n: number }>())?.n).toBe(1);
    expect(c.triggered.length).toBe(0);
  });

  it("the real http server path issues a 402 with payment requirements instead of a facilitator 503", async () => {
    resetHttpServerCache();
    const db = openTestDb(); const c = ctx(db); c.env.X402_PAY_TO = PAY_TO;
    const r = await handlePaidScan(c, req(), "base", undefined, supportsExactOnBase());
    expect(r.status).toBe(402);
    const required = r.headers.get("PAYMENT-REQUIRED");
    expect(required).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(String(required), "base64").toString("utf8")) as { accepts: Array<{ scheme: string; network: string; amount: string; asset: string; payTo: string }> };
    expect(decoded.accepts[0]).toMatchObject({ scheme: "exact", network: "eip155:8453", amount: "1000000", payTo: PAY_TO });
  });

  it("a facilitator that cannot be reached is a 503, a facilitator that supports the wrong network is a 500", async () => {
    resetHttpServerCache();
    const db = openTestDb(); const c = ctx(db); c.env.X402_PAY_TO = PAY_TO;
    const down = await handlePaidScan(c, req(), "base", undefined, facilitatorStub(async () => { throw new TypeError("fetch failed"); }));
    expect(down.status).toBe(503);
    const wrong = await handlePaidScan(c, req(), "base", undefined, facilitatorStub(async () => ({ kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:1" }], extensions: [], signers: {} })));
    expect(wrong.status).toBe(500);
    expect(((await wrong.json()) as { error: string }).error).toMatch(/misconfigured/);
  });

  it("a job still at status created is settled again rather than reported as a success", async () => {
    const db = openTestDb(); const c = ctx(db);
    await db.prepare("INSERT INTO scan_jobs (run_id, chain, source, status, created_at, payment_id) VALUES (?,?,?,?,?,?)")
      .bind("paid-base-orphan", "base", "paid", "created", "2026-09-15T11:00:00.000Z", "0xpayer:0xn1").run();
    const r = await handlePaidScan(c, req("sig"), "base", server({ verified: true, settleOk: true }));
    expect(r.status).toBe(202);
    const j = await r.json() as { run_id: string; payment_tx: string };
    expect(j.run_id).toBe("paid-base-orphan");
    expect(j.payment_tx).toBe("0xtx");
    expect((await readJob(db, "paid-base-orphan"))?.status).toBe("settled");
    expect((await db.prepare("SELECT COUNT(*) AS n FROM scan_jobs").first<{ n: number }>())?.n).toBe(1);
  });

  it("two concurrent requests carrying one payment both get the same run, neither 500s", async () => {
    const db = openTestDb(); const c = ctx(db);
    const [a, b] = await Promise.all([
      handlePaidScan(c, req("sig"), "base", server({ verified: true, settleOk: true })),
      handlePaidScan(c, req("sig"), "base", server({ verified: true, settleOk: true })),
    ]);
    expect(a.status).toBe(202); expect(b.status).toBe(202);
    const ja = await a.json() as { run_id: string };
    const jb = await b.json() as { run_id: string };
    expect(ja.run_id).toBe(jb.run_id);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM scan_jobs").first<{ n: number }>())?.n).toBe(1);
  });

  it("a request that arrives while another is settling the same payment does not double-settle", async () => {
    const db = openTestDb(); const c = ctx(db);
    let settlementCalls = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const gatedServer = {
      processHTTPRequest: async (cc: { paymentHeader?: string }) => cc.paymentHeader
        ? { type: "payment-verified", paymentPayload: payload, paymentRequirements: { scheme: "exact", network: "eip155:8453", asset: "0xusdc", amount: "1000000", payTo: "0x1", maxTimeoutSeconds: 300, extra: {} }, cancellationDispatcher: { cancel: async () => null } }
        : { type: "payment-error", response: { status: 402, headers: {}, body: { error: "payment required" } } },
      processSettlement: async () => {
        settlementCalls++;
        await gate;
        return { success: true, transaction: "0xtxA", network: "eip155:8453", headers: { "PAYMENT-RESPONSE": "b64resp" }, requirements: {} };
      },
    } as never;

    const aPromise = handlePaidScan(c, req("sig"), "base", gatedServer);
    await new Promise((r) => setTimeout(r, 0));
    const b = await handlePaidScan(c, req("sig"), "base", gatedServer);
    expect(b.status).toBe(202);
    const bj = await b.json() as { run_id: string; payment_tx: string | null };
    expect(bj.payment_tx).toBeNull();
    releaseGate();
    const a = await aPromise;
    expect(a.status).toBe(202);
    const aj = await a.json() as { run_id: string; payment_tx: string };
    expect(bj.run_id).toBe(aj.run_id);
    expect(settlementCalls).toBe(1);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM scan_jobs").first<{ n: number }>())?.n).toBe(1);
    const job = await db.prepare("SELECT status, payment_tx, error FROM scan_jobs").first<{ status: string; payment_tx: string; error: string | null }>();
    expect(job?.status).toBe("settled");
    expect(job?.payment_tx).toBe("0xtxA");
    expect(job?.error).toBeNull();
  });
});
