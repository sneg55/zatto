import { NextAdapter, x402HTTPResourceServer, x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { NextRequest } from "next/server";
import type { AppContext } from "../http/context";
import { createJob, readJobByPayment, setJobPayment, failJob } from "../db/queries";
import { triggerStep } from "../http/context";

export const SCAN_PRICE_USDC_UNITS = "5000000";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export function buildHttpServer(env: { FACILITATOR_URL: string; X402_PAY_TO: string }, routePattern: string) {
  const facilitator = new HTTPFacilitatorClient({ url: env.FACILITATOR_URL });
  const server = new x402ResourceServer(facilitator).register("eip155:8453", new ExactEvmScheme());
  return new x402HTTPResourceServer(server, {
    [routePattern]: {
      accepts: { scheme: "exact", network: "eip155:8453", payTo: env.X402_PAY_TO, price: { amount: SCAN_PRICE_USDC_UNITS, asset: BASE_USDC }, maxTimeoutSeconds: 300 },
      description: "Run a Zatto Smart Money crowding scan now",
      mimeType: "application/json",
    },
  });
}

function toResponse(i: { status: number; headers: Record<string, string>; body?: unknown }): Response {
  return new Response(JSON.stringify(i.body ?? {}), { status: i.status, headers: { ...i.headers, "content-type": "application/json" } });
}

export function paymentIdOf(payload: { payload: Record<string, unknown> }): string | null {
  const auth = payload.payload["authorization"] as { nonce?: string; from?: string } | undefined;
  return auth?.nonce && auth?.from ? `${auth.from.toLowerCase()}:${auth.nonce}` : null;
}

export async function handlePaidScan(ctx: AppContext, req: NextRequest, chain: string, httpServer = buildHttpServer(ctx.env, "/api/scan/[chain]")): Promise<Response> {
  if (chain !== "base") return Response.json({ error: "unknown chain" }, { status: 400 });
  const adapter = new NextAdapter(req);
  const context = { adapter, path: req.nextUrl.pathname, method: req.method, paymentHeader: adapter.getHeader("payment-signature") ?? undefined, routePattern: "/api/scan/[chain]" };
  let result;
  try { result = await httpServer.processHTTPRequest(context); } catch { return Response.json({ error: "payment facilitator unavailable, paid scans are paused" }, { status: 503 }); }
  if (result.type === "payment-error") return toResponse(result.response);
  if (result.type !== "payment-verified") return Response.json({ error: "payment required" }, { status: 402 });
  const paymentId = paymentIdOf(result.paymentPayload as { payload: Record<string, unknown> });
  if (!paymentId) return Response.json({ error: "payment payload missing authorization" }, { status: 402 });
  const now = ctx.now();
  const existing = await readJobByPayment(ctx.db, paymentId);
  if (existing) return Response.json({ run_id: existing.run_id, payment_tx: existing.payment_tx, url: `${ctx.env.PUBLIC_BASE_URL}/scan/${chain}/${existing.run_id}` }, { status: 202 });
  const runId = `paid-${chain}-${now.getTime().toString(36)}`;
  await createJob(ctx.db, { runId, chain, source: "paid", status: "created", paymentId, now: now.toISOString() });
  const settle = await httpServer.processSettlement(result.paymentPayload, result.paymentRequirements, result.declaredExtensions, { request: context }, undefined, result.beforeHandlerSettlement);
  if (!settle.success) {
    await failJob(ctx.db, runId, `settlement failed: ${settle.errorReason}`, now.toISOString());
    return toResponse(settle.response);
  }
  await setJobPayment(ctx.db, runId, settle.transaction);
  triggerStep(ctx, runId);
  return new Response(JSON.stringify({ run_id: runId, payment_tx: settle.transaction, url: `${ctx.env.PUBLIC_BASE_URL}/scan/${chain}/${runId}` }), { status: 202, headers: { ...settle.headers, "content-type": "application/json" } });
}
