import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { openTestDb } from "../tests/helpers/d1";
import { NansenClient } from "../lib/nansen/client";
import { fetchScreenerTokens, fetchSmartMoneyBuyers, fetchTapePage, fetchWalletBuys } from "../lib/nansen/endpoints";
import { getCloses } from "../lib/nansen/candles";
import { getTape } from "../lib/nansen/tape";
import { neededHours, scoreBuy } from "../lib/score/perBuy";
import { scoreWallet } from "../lib/score/perWallet";
import { minutesNeeded } from "../lib/jobs/scoreWallet";

const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const db = openTestDb();
const now = new Date();
const client = new NansenClient({ db, apiKey: vars.NANSEN_API_KEY, fetch, now: () => now, budget: 100 });
mkdirSync("tests/fixtures/real", { recursive: true });
const save = (name: string, data: unknown) => writeFileSync(`tests/fixtures/real/${name}.json`, JSON.stringify(data, null, 2));

const tokens = await fetchScreenerTokens(client, "base");
console.log("step 1 screener tokens", tokens.length);
save("screener", tokens);
const buyers = await fetchSmartMoneyBuyers(client, "base", tokens[0], 7, now);
console.log("step 1b smart money buyers on", tokens[0], buyers.length);
const pastHour = new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 13);
const page = await fetchTapePage(client, "base", tokens[0], pastHour, 1);
console.log("step 2 tape rows", page.rows.length, "isLast", page.isLast, "first", page.rows[0]);
save("tape-page", page);
const wallet = buyers.sort((a, b) => b.buys - a.buys)[0]?.wallet;
if (!wallet) throw new Error("no smart money buyers found for the discovered token");
const buys = await fetchWalletBuys(client, db, "base", wallet, now);
console.log("step 3 wallet", wallet, "qualifying buys", buys.length);
save("wallet-buys", buys);
const scored = [];
for (const buy of buys.slice(0, 3)) {
  const buckets = [];
  for (const h of neededHours(buy.ts)) buckets.push(await getTape(db, client, "base", buy.token, h, now, "score"));
  const closes = await getCloses(db, client, "base", buy.token, minutesNeeded(buy.ts), now);
  console.log("step 4 candles for", buy.token, "have", closes.size, "of", 4);
  scored.push(scoreBuy({ buy, buckets, closes }));
}
const ws = scoreWallet("base", wallet, scored);
console.log("step 5 wallet score", JSON.stringify({ verdict: ws.verdict, n: ws.n, buys: scored.map((s) => ({ base: s.baselineRate, m60: s.newBuyers.m60, fast: s.fastShare, ratio: s.crowdRatio, d24: s.delayedReturn.h24, state: s.exclusion ?? "usable" })) }, null, 1));
save("wallet-score", ws);
console.log("step 6 requests used", client.requests);
