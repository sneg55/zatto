import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { openTestDb } from "../tests/helpers/d1";
import { NansenClient } from "../lib/nansen/client";
import { fetchScreenerTokens, fetchSmartMoneyBuyers, fetchWalletBuys } from "../lib/nansen/endpoints";
import { scoreOneWallet } from "../lib/jobs/scoreWallet";
import { MIN_USABLE_BUYS } from "../lib/score/constants";
import type { Buy, WalletScore } from "../lib/score/types";

const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const db = openTestDb();
const now = new Date();
const REQUEST_CAP = 300;
const client = new NansenClient({ db, apiKey: vars.NANSEN_API_KEY, fetch, now: () => now, budget: 2000, sleep: async () => {} });
mkdirSync("tests/fixtures/real", { recursive: true });
const save = (name: string, data: unknown) => writeFileSync(`tests/fixtures/real/${name}.json`, JSON.stringify(data, null, 2));
const room = (n: number) => client.requests + n <= REQUEST_CAP;

const SCREENER_TOKENS_TO_POOL = 6;
const tokens = await fetchScreenerTokens(client, "base");
console.log("step 1 screener tokens", tokens.length);
save("screener", tokens);

const candidatePool = new Map<string, number>();
for (const token of tokens.slice(0, SCREENER_TOKENS_TO_POOL)) {
  if (!room(1)) break;
  const buyers = await fetchSmartMoneyBuyers(client, "base", token, 7, now);
  console.log("step 1b smart money buyers on", token, buyers.length);
  for (const b of buyers) candidatePool.set(b.wallet, Math.max(candidatePool.get(b.wallet) ?? 0, b.buys));
}
const candidates = [...candidatePool.entries()].map(([wallet, buys]) => ({ wallet, buys })).sort((a, b) => b.buys - a.buys);
console.log("step 2 pooled candidates", candidates.length);
if (candidates.length === 0) throw new Error(`no smart money buyers found across the first ${SCREENER_TOKENS_TO_POOL} screener tokens`);

let winner: { wallet: string; buys: Buy[]; score: WalletScore } | null = null;
let budgetExhausted = false;
const attempts: Array<{ wallet: string; qualifyingBuys: number; n: number; verdict?: string; excluded?: { capped: number; immature: number; noPrice: number } }> = [];

for (const candidate of candidates) {
  if (!room(2)) { budgetExhausted = true; break; }
  const buys = await fetchWalletBuys(client, db, "base", candidate.wallet, now);
  console.log("step 3 wallet", candidate.wallet, "qualifying buys", buys.length);
  if (buys.length < MIN_USABLE_BUYS) {
    attempts.push({ wallet: candidate.wallet, qualifyingBuys: buys.length, n: 0 });
    continue;
  }
  if (!room(4)) { budgetExhausted = true; break; }
  const requestCap = Math.max(0, REQUEST_CAP - client.requests);
  const { score } = await scoreOneWallet(db, client, "base", candidate.wallet, buys, now, requestCap);
  console.log("step 4 wallet", candidate.wallet, "n", score.n, "verdict", score.verdict, "excluded", JSON.stringify(score.excluded));
  attempts.push({ wallet: candidate.wallet, qualifyingBuys: buys.length, n: score.n, verdict: score.verdict, excluded: score.excluded });
  if (score.n >= MIN_USABLE_BUYS) { winner = { wallet: candidate.wallet, buys, score }; break; }
  if (!room(2)) { budgetExhausted = true; break; }
}

console.log("attempts", JSON.stringify(attempts, null, 1));
if (!winner) {
  const reason = budgetExhausted
    ? `hit the ${REQUEST_CAP} request cap before any candidate reached n >= ${MIN_USABLE_BUYS}`
    : `none of ${candidates.length} candidate wallets reached n >= ${MIN_USABLE_BUYS}`;
  console.log("step 6 requests used", client.requests);
  throw new Error(reason);
}
save("wallet-buys", winner.buys);
save("wallet-score", winner.score);
console.log("step 5 winner", winner.wallet, JSON.stringify({
  verdict: winner.score.verdict, n: winner.score.n,
  buys: winner.score.buys.map((s) => ({ base: s.baselineRate, m60: s.newBuyers.m60, fast: s.fastShare, ratio: s.crowdRatio, d24: s.delayedReturn.h24, state: s.exclusion ?? "usable" })),
}, null, 1));
console.log("step 6 requests used", client.requests);
