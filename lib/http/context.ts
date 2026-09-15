import type { D1Like, ZattoEnv } from "../db/d1";
import { getDb, getEnv, getWaitUntil } from "../db/d1";
import { NansenClient } from "../nansen/client";

export interface AppContext { db: D1Like; env: ZattoEnv; now: () => Date; fetch: typeof fetch; waitUntil: (p: Promise<unknown>) => void }

export function buildContext(): AppContext {
  return { db: getDb(), env: getEnv(), now: () => new Date(), fetch: globalThis.fetch.bind(globalThis), waitUntil: getWaitUntil() };
}

export function nansenClient(ctx: AppContext, runId: string | null): NansenClient {
  return new NansenClient({ db: ctx.db, apiKey: ctx.env.NANSEN_API_KEY, fetch: ctx.fetch, now: ctx.now, budget: Number(ctx.env.DAILY_CREDIT_BUDGET), runId });
}

export function triggerStep(ctx: AppContext, runId: string): void {
  const url = `${ctx.env.PUBLIC_BASE_URL}/api/internal/scan-step`;
  const f = ctx.env.WORKER_SELF_REFERENCE?.fetch ?? ctx.fetch;
  ctx.waitUntil(f(url, { method: "POST", headers: { "X-Zatto-Internal": ctx.env.INTERNAL_SECRET, "content-type": "application/json" }, body: JSON.stringify({ run_id: runId }) }).then(() => undefined, () => undefined));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
