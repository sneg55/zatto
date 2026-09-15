import { NextAdapter, x402HTTPResourceServer, x402ResourceServer } from "@x402/next";
import { FacilitatorCapabilityError, HTTPFacilitatorClient, RouteConfigurationError, type FacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { NextRequest } from "next/server";
import type { AppContext } from "../http/context";
import { createJob, readJobByPayment, setJobPayment, failJob } from "../db/queries";
import { triggerStep } from "../http/context";

export const SCAN_PRICE_USDC_UNITS = "5000000";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SCAN_ROUTE_PATTERN = "/api/scan/[chain]";

export interface X402Env { FACILITATOR_URL: string; X402_PAY_TO: string }

export function buildHttpServer(env: X402Env, routePattern: string, facilitator?: FacilitatorClient): x402HTTPResourceServer {
  const client = facilitator ?? new HTTPFacilitatorClient({ url: env.FACILITATOR_URL });
  const server = new x402ResourceServer(client).register("eip155:8453", new ExactEvmScheme());
  return new x402HTTPResourceServer(server, {
    [routePattern]: {
      accepts: { scheme: "exact", network: "eip155:8453", payTo: env.X402_PAY_TO, price: { amount: SCAN_PRICE_USDC_UNITS, asset: BASE_USDC }, maxTimeoutSeconds: 300 },
      description: "Run a Zatto Smart Money crowding scan now",
      mimeType: "application/json",
    },
  });
}

let cached: { key: string; server: Promise<x402HTTPResourceServer> } | null = null;

export function resetHttpServerCache(): void {
  cached = null;
}

export function initializedHttpServer(env: X402Env, routePattern: string, facilitator?: FacilitatorClient): Promise<x402HTTPResourceServer> {
  const build = async () => {
    const s = buildHttpServer(env, routePattern, facilitator);
    await s.initialize();
    return s;
  };
  if (facilitator) return build();
  const key = `${env.FACILITATOR_URL}|${env.X402_PAY_TO}|${routePattern}`;
  if (!cached || cached.key !== key) {
    const server = build();
    cached = { key, server };
    server.catch(() => { if (cached?.server === server) cached = null; });
  }
  return cached.server;
}

export function isPaidRouteConfigError(e: unknown): boolean {
  return e instanceof RouteConfigurationError || e instanceof FacilitatorCapabilityError;
}

function facilitatorFailure(e: unknown): Response {
  if (isPaidRouteConfigError(e)) return Response.json({ error: "paid scan route is misconfigured, paid scans are unavailable" }, { status: 500 });
  return Response.json({ error: "payment facilitator unavailable, paid scans are paused" }, { status: 503 });
}

function isUniqueViolation(e: unknown): boolean {
  return /UNIQUE constraint failed/i.test(e instanceof Error ? e.message : String(e));
}

function toResponse(i: { status: number; headers: Record<string, string>; body?: unknown }): Response {
  return new Response(JSON.stringify(i.body ?? {}), { status: i.status, headers: { ...i.headers, "content-type": "application/json" } });
}

export function paymentIdOf(payload: { payload: Record<string, unknown> }): string | null {
  const auth = payload.payload["authorization"] as { nonce?: string; from?: string } | undefined;
  return auth?.nonce && auth?.from ? `${auth.from.toLowerCase()}:${auth.nonce}` : null;
}

export async function handlePaidScan(ctx: AppContext, req: NextRequest, chain: string, httpServer?: x402HTTPResourceServer, facilitator?: FacilitatorClient): Promise<Response> {
  if (chain !== "base") return Response.json({ error: "unknown chain" }, { status: 400 });
  let server: x402HTTPResourceServer;
  try { server = httpServer ?? await initializedHttpServer(ctx.env, SCAN_ROUTE_PATTERN, facilitator); } catch (e) { return facilitatorFailure(e); }
  const adapter = new NextAdapter(req);
  const context = { adapter, path: req.nextUrl.pathname, method: req.method, paymentHeader: adapter.getHeader("payment-signature") ?? undefined, routePattern: SCAN_ROUTE_PATTERN };
  let result;
  try { result = await server.processHTTPRequest(context); } catch (e) { return facilitatorFailure(e); }
  if (result.type === "payment-error") return toResponse(result.response);
  if (result.type !== "payment-verified") return Response.json({ error: "payment required" }, { status: 402 });
  const paymentId = paymentIdOf(result.paymentPayload as { payload: Record<string, unknown> });
  if (!paymentId) return Response.json({ error: "payment payload missing authorization" }, { status: 402 });
  const now = ctx.now();
  const scanUrl = (id: string) => `${ctx.env.PUBLIC_BASE_URL}/scan/${chain}/${id}`;
  const existing = await readJobByPayment(ctx.db, paymentId);
  if (existing && existing.status === "failed") return Response.json({ run_id: existing.run_id, error: existing.error }, { status: 402 });
  if (existing && existing.status !== "created") return Response.json({ run_id: existing.run_id, payment_tx: existing.payment_tx, url: scanUrl(existing.run_id) }, { status: 202 });
  const runId = existing?.run_id ?? `paid-${chain}-${now.getTime().toString(36)}`;
  if (!existing) {
    try {
      await createJob(ctx.db, { runId, chain, source: "paid", status: "created", paymentId, now: now.toISOString() });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const concurrent = await readJobByPayment(ctx.db, paymentId);
      if (!concurrent) throw e;
      if (concurrent.status === "failed") return Response.json({ run_id: concurrent.run_id, error: concurrent.error }, { status: 402 });
      return Response.json({ run_id: concurrent.run_id, payment_tx: concurrent.payment_tx, url: scanUrl(concurrent.run_id) }, { status: 202 });
    }
  }
  let settle;
  try {
    settle = await server.processSettlement(result.paymentPayload, result.paymentRequirements, result.declaredExtensions, { request: context }, undefined, result.beforeHandlerSettlement);
  } catch {
    await failJob(ctx.db, runId, "settlement facilitator unreachable", now.toISOString());
    return Response.json({ error: "settlement facilitator unreachable" }, { status: 503 });
  }
  if (!settle.success) {
    await failJob(ctx.db, runId, `settlement failed: ${settle.errorReason}`, now.toISOString());
    return toResponse(settle.response);
  }
  await setJobPayment(ctx.db, runId, settle.transaction);
  triggerStep(ctx, runId);
  return new Response(JSON.stringify({ run_id: runId, payment_tx: settle.transaction, url: scanUrl(runId) }), { status: 202, headers: { ...settle.headers, "content-type": "application/json" } });
}
