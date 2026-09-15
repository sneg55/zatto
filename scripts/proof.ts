import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { openTestDb } from "../tests/helpers/d1";
import { NansenClient } from "../lib/nansen/client";
import { fetchScreenerTokens, fetchSmartMoneyBuyers, fetchWalletBuys } from "../lib/nansen/endpoints";
import { getCloses } from "../lib/nansen/candles";
import { getTape } from "../lib/nansen/tape";
import { neededHours, scoreBuy } from "../lib/score/perBuy";
import { scoreWallet } from "../lib/score/perWallet";
import { minutesNeeded } from "../lib/jobs/scoreWallet";
import type { Buy, BuyScore } from "../lib/score/types";

const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const db = openTestDb();
const now = new Date();
const client = new NansenClient({ db, apiKey: vars.NANSEN_API_KEY, fetch, now: () => now, budget: 200 });
mkdirSync("tests/fixtures/real", { recursive: true });
const save = (name: string, data: unknown) => writeFileSync(`tests/fixtures/real/${name}.json`, JSON.stringify(data, null, 2));
const REQUEST_CAP = 24;
const room = (n: number) => client.requests + n <= REQUEST_CAP;

const tokens = await fetchScreenerTokens(client, "base");
console.log("step 1 screener tokens", tokens.length);
save("screener", tokens);
const buyers = await fetchSmartMoneyBuyers(client, "base", tokens[0], 7, now);
console.log("step 1b smart money buyers on", tokens[0], buyers.length);

const candidates = buyers.sort((a, b) => b.buys - a.buys).slice(0, 5);
if (candidates.length === 0) throw new Error("no smart money buyers found for the discovered token");

let winner: { wallet: string; buys: Buy[]; scored: BuyScore[] } | null = null;
let budgetExhausted = false;
for (const candidate of candidates) {
  if (!room(2)) { budgetExhausted = true; break; }
  const candidateBuys = await fetchWalletBuys(client, db, "base", candidate.wallet, now);
  console.log("step 3 wallet", candidate.wallet, "qualifying buys", candidateBuys.length);
  if (candidateBuys.length === 0) continue;
  const scored: BuyScore[] = [];
  for (const buy of candidateBuys.slice(0, 2)) {
    if (!room(1)) { budgetExhausted = true; break; }
    const buckets = [];
    for (const h of neededHours(buy.ts)) {
      if (!room(1)) { budgetExhausted = true; break; }
      buckets.push(await getTape(db, client, "base", buy.token, h, now, "score"));
    }
    if (budgetExhausted) break;
    if (!room(1)) { budgetExhausted = true; break; }
    const closes = await getCloses(db, client, "base", buy.token, minutesNeeded(buy.ts), now);
    const bs = scoreBuy({ buy, buckets, closes });
    console.log("step 4 candles for", buy.token, "have", closes.size, "of 4, usable", bs.usable);
    scored.push(bs);
    if (bs.usable) break;
  }
  if (scored.some((s) => s.usable)) { winner = { wallet: candidate.wallet, buys: candidateBuys, scored }; break; }
  if (budgetExhausted) break;
}
if (!winner) {
  const reason = budgetExhausted ? `hit the ${REQUEST_CAP} request cap before any candidate scored` : `none of ${candidates.length} candidate wallets produced a usable buy`;
  throw new Error(reason);
}
save("wallet-buys", winner.buys);
const ws = scoreWallet("base", winner.wallet, winner.scored);
console.log("step 5 wallet", winner.wallet, "score", JSON.stringify({ verdict: ws.verdict, n: ws.n, buys: winner.scored.map((s) => ({ base: s.baselineRate, m60: s.newBuyers.m60, fast: s.fastShare, ratio: s.crowdRatio, d24: s.delayedReturn.h24, state: s.exclusion ?? "usable" })) }, null, 1));
save("wallet-score", ws);
console.log("step 6 requests used", client.requests);
