import type { Buy } from "../score/types";

export interface Candidate { wallet: string; buys: Buy[]; buckets: Array<{ token: string; hour: string }>; dropped?: string }
export type JobStatus = "created" | "settling" | "settled" | "running" | "done" | "failed";
export interface ScanJob {
  run_id: string; chain: string; source: "cron" | "paid"; status: JobStatus;
  created_at: string; started_at: string | null; finished_at: string | null;
  candidates: string; cursor: number; bucket_cursor: number; planned_requests: number; used_requests: number;
  attempts: number; lease_until: string | null; error: string | null; payment_id: string | null; payment_tx: string | null; published: number;
}
export interface StepBudgets { requests: number; planRequests: number; seconds: number }
export const DEFAULT_BUDGETS: StepBudgets = { requests: 40, planRequests: 40, seconds: 20 };
