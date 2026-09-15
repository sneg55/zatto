import { readJob } from "../db/queries";
import { runScanStep } from "../jobs/step";
import { DEFAULT_BUDGETS } from "../jobs/types";
import { constantTimeEqual, nansenClient, triggerStep, type AppContext } from "./context";

export async function handleInternalStep(ctx: AppContext, req: Request): Promise<Response> {
  const secret = req.headers.get("X-Zatto-Internal") ?? "";
  if (!secret || !constantTimeEqual(secret, ctx.env.INTERNAL_SECRET)) return new Response("not found", { status: 404 });
  let runId = "";
  try { runId = String(((await req.json()) as { run_id?: string }).run_id ?? ""); } catch { return new Response("not found", { status: 404 }); }
  const job = runId ? await readJob(ctx.db, runId) : null;
  if (!job) return new Response("not found", { status: 404 });
  const result = await runScanStep(ctx.db, nansenClient(ctx, runId), runId, ctx.now(), DEFAULT_BUDGETS, Number(ctx.env.RUN_REQUEST_CAP));
  if (!result.done && !result.failed) triggerStep(ctx, runId);
  return Response.json({ run_id: runId, ...result });
}
