import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const zattoUrl = process.env.ZATTO_URL ?? "http://localhost:3000";
const payerKey = process.env.PAYER_KEY;
if (!payerKey) { console.error("PAYER_KEY missing"); process.exit(1); }

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 20 * 60_000;
const FETCH_TIMEOUT_MS = 30_000;
const MIN_USABLE_BUYS = 5;

const timedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

async function getHealth(): Promise<unknown> {
  const res = await timedFetch(`${zattoUrl}/api/health`);
  const body = await res.json();
  console.log(res.status, JSON.stringify(body));
  return body;
}

function lifetimeOkCalls(health: unknown): number {
  const h = health as { lifetime_ok_calls?: number };
  return h.lifetime_ok_calls ?? 0;
}

console.log("health before");
const before = await getHealth();

const account = privateKeyToAccount(payerKey as `0x${string}`);
const paidFetch = wrapFetchWithPaymentFromConfig(timedFetch, { schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }] });
const scanRes = await paidFetch(`${zattoUrl}/api/scan/base`, { method: "POST" });
const scanBody = (await scanRes.json()) as { run_id?: string; error?: string };
console.log(scanRes.status, JSON.stringify(scanBody));
if (!scanBody.run_id) {
  console.error("paid scan did not return a run_id");
  process.exit(1);
}
const runId = scanBody.run_id;

const deadline = Date.now() + POLL_TIMEOUT_MS;
let finalText: string | null = null;
let finalStatus: "done" | "failed" | null = null;

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  await getHealth();
  const pageRes = await timedFetch(`${zattoUrl}/scan/base/${runId}`);
  const text = await pageRes.text();
  if (text.includes("Status: done")) { finalText = text; finalStatus = "done"; break; }
  if (text.includes("Status: failed")) { finalText = text; finalStatus = "failed"; break; }
}

if (finalStatus === null) {
  console.error(`timed out after ${POLL_TIMEOUT_MS / 60_000} minutes waiting for run ${runId} to finish`);
  process.exit(1);
}

if (finalStatus === "failed") {
  console.error(`run ${runId} failed`);
  process.exit(1);
}

const usableBuyCounts = [...(finalText ?? "").matchAll(/(\d+)\s*\(\s*\d+\s*tokens\)/g)].map((m) => Number(m[1]));
const hasUsableRow = usableBuyCounts.some((n) => n >= MIN_USABLE_BUYS);
if (!hasUsableRow) {
  console.error(`run ${runId} is done but no wallet row has ${MIN_USABLE_BUYS} or more usable buys`);
  process.exit(1);
}

console.log("health after");
const after = await getHealth();
console.log("lifetime ok calls delta", lifetimeOkCalls(after) - lifetimeOkCalls(before));
console.log("smoke passed", runId);
