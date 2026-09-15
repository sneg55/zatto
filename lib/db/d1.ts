import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface D1Row { [k: string]: unknown }
export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = D1Row>(): Promise<T | null>;
  all<T = D1Row>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<unknown[]>;
}

export interface ZattoEnv {
  DB: D1Like;
  NANSEN_API_KEY: string;
  X402_PAY_TO: string;
  INTERNAL_SECRET: string;
  FACILITATOR_URL: string;
  DAILY_CREDIT_BUDGET: string;
  RUN_REQUEST_CAP: string;
  LIVE_WALLET_PER_IP_PER_HOUR: string;
  LIVE_WALLET_CONCURRENCY: string;
  PUBLIC_BASE_URL: string;
  WORKER_SELF_REFERENCE?: { fetch: typeof fetch };
}

export function getEnv(): ZattoEnv {
  return getCloudflareContext().env as unknown as ZattoEnv;
}

export function getDb(): D1Like {
  return getEnv().DB;
}

export function getWaitUntil(): (p: Promise<unknown>) => void {
  const ctx = getCloudflareContext().ctx;
  return (p) => ctx.waitUntil(p);
}
