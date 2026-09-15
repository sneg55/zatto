import type { D1Like } from "../db/d1";
import { finishCall, lastRateRemaining, reserveCredits, utcDayStart } from "../db/queries";
import { BudgetExhaustedError, CREDITS } from "./credits";

export const NANSEN_BASE = "https://api.nansen.ai/api/v1/";

export interface NansenClientOptions {
  db: D1Like; apiKey: string; fetch: typeof fetch; now: () => Date; budget: number;
  runId?: string | null; sleep?: (ms: number) => Promise<void>; maxThrottleMs?: number;
}

export const LIVE_MAX_THROTTLE_MS = 2_000;

export class NansenClient {
  public requests = 0;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly o: NansenClientOptions) {
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async post<T>(endpoint: string, body: unknown): Promise<{ data: T; headers: Headers }> {
    const credits = CREDITS[endpoint];
    if (credits === undefined) throw new Error(`unknown endpoint ${endpoint}`);
    await this.throttle();
    let attempt = 0;
    for (;;) {
      attempt++;
      const now = this.o.now();
      const id = await reserveCredits(this.o.db, { ts: now.toISOString(), dayStart: utcDayStart(now), endpoint, credits, budget: this.o.budget, runId: this.o.runId ?? null });
      if (id === null) throw new BudgetExhaustedError(0, this.o.budget);
      this.requests++;
      const res = await this.o.fetch(NANSEN_BASE + endpoint, { method: "POST", headers: { apikey: this.o.apiKey, "content-type": "application/json" }, body: JSON.stringify(body) });
      const minute = num(res.headers.get("X-RateLimit-Remaining-Minute"));
      const second = num(res.headers.get("X-RateLimit-Remaining-Second"));
      if (res.ok) {
        await finishCall(this.o.db, id, "ok", minute, second);
        return { data: (await res.json()) as T, headers: res.headers };
      }
      await finishCall(this.o.db, id, "failed", minute, second);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 2) throw new Error(`nansen ${endpoint} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const retryAfter = num(res.headers.get("Retry-After"));
      await this.sleep(res.status === 429 ? (retryAfter ?? 2) * 1000 : 2000);
    }
  }

  private async throttle(): Promise<void> {
    const last = await lastRateRemaining(this.o.db);
    if (!last || last.minute == null || last.minute >= 20) return;
    const age = this.o.now().getTime() - new Date(last.ts).getTime();
    if (age >= 60_000) return;
    await this.sleep(Math.min(60_000 - age, this.o.maxThrottleMs ?? 60_000));
  }
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
