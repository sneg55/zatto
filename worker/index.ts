// @ts-expect-error
import { default as handler } from "../.open-next/worker.js";
import { sweep } from "../lib/jobs/sweeper";
import { MAX_ATTEMPTS } from "../lib/jobs/leases";
import type { ZattoEnv } from "../lib/db/d1";

const worker = {
  fetch: handler.fetch,
  async scheduled(_event: ScheduledEvent, env: ZattoEnv, ctx: ExecutionContext) {
    const trigger = async (runId: string) => {
      const f = env.WORKER_SELF_REFERENCE?.fetch ?? fetch;
      ctx.waitUntil(f(`${env.PUBLIC_BASE_URL}/api/internal/scan-step`, { method: "POST", headers: { "X-Zatto-Internal": env.INTERNAL_SECRET, "content-type": "application/json" }, body: JSON.stringify({ run_id: runId }) }).then(() => undefined, () => undefined));
    };
    await sweep(env.DB, { chains: ["base"], cronHoursUtc: [0, 6, 12, 18], maxAttempts: MAX_ATTEMPTS }, new Date(), trigger);
  },
};

export default worker;
