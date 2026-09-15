import type { D1Like, ZattoEnv } from "../db/d1";
import { NansenClient } from "../nansen/client";

export interface AppContext { db: D1Like; env: ZattoEnv; now: () => Date; fetch: typeof fetch; waitUntil: (p: Promise<unknown>) => void }

export function assertPublicBaseUrl(url: string | undefined): string {
  if (!url || url.includes("REPLACE")) {
    throw new Error(`PUBLIC_BASE_URL is not set to a real host (got ${url ?? "nothing"}). Put the deployed Worker URL in wrangler.jsonc: the scan step trigger and the scan URL handed to a payer are both built from it.`);
  }
  return url;
}

export async function buildContext(): Promise<AppContext> {
  const { getDb, getEnv, getWaitUntil } = await import("../db/d1");
  const env = getEnv();
  assertPublicBaseUrl(env.PUBLIC_BASE_URL);
  return { db: getDb(), env, now: () => new Date(), fetch: globalThis.fetch.bind(globalThis), waitUntil: getWaitUntil() };
}

export function nansenClient(ctx: AppContext, runId: string | null, maxThrottleMs?: number): NansenClient {
  return new NansenClient({ db: ctx.db, apiKey: ctx.env.NANSEN_API_KEY, fetch: ctx.fetch, now: ctx.now, budget: Number(ctx.env.DAILY_CREDIT_BUDGET), runId, maxThrottleMs });
}

export function triggerStep(ctx: AppContext, runId: string): void {
  const url = `${ctx.env.PUBLIC_BASE_URL}/api/internal/scan-step`;
  const binding = ctx.env.WORKER_SELF_REFERENCE;
  const f = binding ? binding.fetch.bind(binding) : ctx.fetch.bind(globalThis);
  try {
    ctx.waitUntil(f(url, { method: "POST", headers: { "X-Zatto-Internal": ctx.env.INTERNAL_SECRET, "content-type": "application/json" }, body: JSON.stringify({ run_id: runId }) }).then(() => undefined, () => undefined));
  } catch {
    return;
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
