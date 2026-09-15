import type { D1Like } from "../db/d1";
import { deleteScratchScores, failJob, publishJob, readJob, readScratchScore, releaseJobLease, saveJobPlan, saveJobProgress, takeJobLease, writeScore, writeScratchScore } from "../db/queries";
import type { NansenClient } from "../nansen/client";
import { BudgetExhaustedError } from "../nansen/credits";
import { getTape } from "../nansen/tape";
import { getCloses } from "../nansen/candles";
import { neededHours, scoreBuy } from "../score/perBuy";
import { scoreWallet } from "../score/perWallet";
import type { BuyScore, TapeBucket } from "../score/types";
import { planJob } from "./planner";
import { minutesNeeded } from "./scoreWallet";
import type { Candidate, StepBudgets } from "./types";
import { LEASE_SECONDS } from "./leases";

const RUN_REQUEST_CAP = 3000;

function scratchKey(runId: string, wallet: string): string {
  return `zatto:scored:${runId}:${wallet}`;
}

export async function runScanStep(db: D1Like, client: NansenClient, runId: string, now: Date, budgets: StepBudgets, requestCap = RUN_REQUEST_CAP): Promise<{ done: boolean; failed?: string }> {
  const nowIso = now.toISOString();
  const leased = await takeJobLease(db, runId, nowIso, new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString());
  if (!leased) return { done: false, failed: "lease held or job not runnable" };
  const started = Date.now();
  const startRequests = client.requests;
  const over = () => client.requests - startRequests >= budgets.requests || (Date.now() - started) / 1000 >= budgets.seconds;
  try {
    let job = (await readJob(db, runId))!;
    if (job.status === "settled") {
      const plan = await planJob(db, client, job.chain, now, requestCap, { planRequests: budgets.planRequests, expired: over });
      await saveJobPlan(db, runId, plan.candidates, plan.plannedRequests, nowIso);
      job = (await readJob(db, runId))!;
    }
    const candidates = JSON.parse(job.candidates) as Candidate[];
    let cursor = job.cursor;
    let bucketCursor = job.bucket_cursor;
    const used = job.used_requests;
    while (cursor < candidates.length) {
      const c = candidates[cursor];
      if (c.dropped) { cursor++; bucketCursor = 0; continue; }
      const key = scratchKey(runId, c.wallet);
      const stored = await readScratchScore(db, job.chain, c.wallet, key);
      const scored: BuyScore[] = stored ? (JSON.parse(stored) as BuyScore[]) : [];
      for (let i = bucketCursor; i < c.buys.length; i++) {
        if (over()) {
          await writeScratchScore(db, job.chain, c.wallet, key, nowIso, scored);
          await saveJobProgress(db, runId, cursor, i, used + client.requests - startRequests);
          return { done: false };
        }
        const buy = c.buys[i];
        const buckets: TapeBucket[] = [];
        for (const hour of neededHours(buy.ts)) buckets.push(await getTape(db, client, job.chain, buy.token, hour, now, "score"));
        const closes = await getCloses(db, client, job.chain, buy.token, minutesNeeded(buy.ts), now);
        scored.push(scoreBuy({ buy, buckets, closes }));
      }
      await writeScore(db, scoreWallet(job.chain, c.wallet, scored), runId, nowIso);
      await deleteScratchScores(db, runId);
      cursor++;
      bucketCursor = 0;
      await saveJobProgress(db, runId, cursor, 0, used + client.requests - startRequests);
    }
    await publishJob(db, runId, nowIso, used + client.requests - startRequests);
    return { done: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const terminal = e instanceof BudgetExhaustedError || /nansen .* 40[23]/.test(msg);
    if (terminal) {
      await deleteScratchScores(db, runId);
      await failJob(db, runId, msg, nowIso);
      return { done: false, failed: msg };
    }
    return { done: false, failed: msg };
  } finally {
    await releaseJobLease(db, runId);
  }
}
