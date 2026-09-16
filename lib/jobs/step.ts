import type { D1Like } from "../db/d1";
import { deleteScratchScores, failJob, loadFreshBuys, publishJob, readJob, readScratchScore, releaseJobLease, saveForming, saveJobPlan, saveJobProgress, takeJobLease, writeScore, writeScratchScore } from "../db/queries";
import type { NansenClient } from "../nansen/client";
import { BudgetExhaustedError } from "../nansen/credits";
import { getTape } from "../nansen/tape";
import { getCloses } from "../nansen/candles";
import { burstHours, neededHours, scoreBuy, scoreBurst } from "../score/perBuy";
import { scoreWallet } from "../score/perWallet";
import type { BurstScore, BuyScore, TapeBucket } from "../score/types";
import { BURST_SETTLE_MINUTES, FORMING_BUYS, FORMING_WINDOW_HOURS } from "../score/constants";
import { planJob } from "./planner";
import { minutesNeeded } from "./scoreWallet";
import type { Candidate, StepBudgets } from "./types";
import { LEASE_SECONDS, PLAN_LEASE_SECONDS } from "./leases";

const RUN_REQUEST_CAP = 3000;

async function formingPass(db: D1Like, client: NansenClient, runId: string, chain: string, wallets: string[], now: Date, over: () => boolean): Promise<void> {
  const settledBy = new Date(now.getTime() - BURST_SETTLE_MINUTES * 60_000).toISOString();
  const since = new Date(now.getTime() - FORMING_WINDOW_HOURS * 3_600_000).toISOString();
  const fresh = await loadFreshBuys(db, chain, wallets, since, settledBy, FORMING_BUYS);
  const scored: BurstScore[] = [];
  for (const buy of fresh) {
    if (over()) break;
    const buckets: TapeBucket[] = [];
    for (const hour of burstHours(buy.ts)) buckets.push(await getTape(db, client, chain, buy.token, hour, now, "recent"));
    scored.push(scoreBurst({ buy, buckets, now }));
  }
  await saveForming(db, runId, scored.filter((s) => s.settled));
}

function scratchKey(runId: string, wallet: string): string {
  return `zatto:scored:${runId}:${wallet}`;
}

export async function runScanStep(db: D1Like, client: NansenClient, runId: string, now: Date, budgets: StepBudgets, requestCap = RUN_REQUEST_CAP): Promise<{ done: boolean; failed?: string }> {
  const nowIso = now.toISOString();
  const pending = await readJob(db, runId);
  if (!pending) return { done: false, failed: "no such job" };
  const seconds = pending.status === "settled" ? PLAN_LEASE_SECONDS : LEASE_SECONDS;
  const leased = await takeJobLease(db, runId, nowIso, new Date(now.getTime() + seconds * 1000).toISOString());
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
    await formingPass(db, client, runId, job.chain, candidates.filter((c) => !c.dropped).map((c) => c.wallet), now, over);
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
