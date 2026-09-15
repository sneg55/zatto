import type { D1Like } from "../db/d1";
import { bumpAttempts, createJob, deleteScratchScores, expiredRunningJobs, failJob, latestCronJobCreatedAt } from "../db/queries";

export interface SweepConfig { chains: string[]; cronHoursUtc: number[]; maxAttempts: number }

export async function sweep(db: D1Like, cfg: SweepConfig, now: Date, trigger: (runId: string) => Promise<void>): Promise<{ resumed: string[]; created: string | null; failed: string[] }> {
  const nowIso = now.toISOString();
  const resumed: string[] = [];
  const failed: string[] = [];
  for (const job of await expiredRunningJobs(db, nowIso, cfg.maxAttempts)) {
    if (job.attempts >= cfg.maxAttempts - 1) {
      await deleteScratchScores(db, job.run_id);
      await failJob(db, job.run_id, "step limit", nowIso);
      failed.push(job.run_id);
      continue;
    }
    await bumpAttempts(db, job.run_id);
    resumed.push(job.run_id);
    await trigger(job.run_id);
  }
  let created: string | null = null;
  for (const chain of cfg.chains) {
    const due = cfg.cronHoursUtc.includes(now.getUTCHours()) && now.getUTCMinutes() < 5;
    const last = await latestCronJobCreatedAt(db, chain);
    const recent = last !== null && now.getTime() - new Date(last).getTime() < 5 * 3_600_000;
    if (due && !recent) {
      created = `cron-${chain}-${nowIso.slice(0, 13).replace(/[-T]/g, "")}`;
      await createJob(db, { runId: created, chain, source: "cron", status: "settled", now: nowIso });
      await trigger(created);
    }
  }
  return { resumed, created, failed };
}
