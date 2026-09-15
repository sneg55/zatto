import type { D1Like, ZattoEnv } from "./db/d1";
import { countCallsToday, countLifetimeOkCalls, jobsByStatus, utcDayStart } from "./db/queries";

export async function buildHealth(db: D1Like, env: Pick<ZattoEnv, "DAILY_CREDIT_BUDGET">, now: Date) {
  const today = await countCallsToday(db, utcDayStart(now));
  const budget = Number(env.DAILY_CREDIT_BUDGET);
  return {
    now: now.toISOString(),
    credits_today: today,
    budget,
    budget_exhausted: today.reserved + today.ok >= budget,
    lifetime_ok_calls: await countLifetimeOkCalls(db),
    jobs: await jobsByStatus(db),
  };
}
