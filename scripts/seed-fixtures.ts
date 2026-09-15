import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const fixturePath = "tests/fixtures/real/wallet-score.json";
if (!existsSync(fixturePath)) {
  console.error(`${fixturePath} is missing. Run "npm run proof" against a real NANSEN_API_KEY first, then commit tests/fixtures/real/*.json before seeding.`);
  process.exit(1);
}

const ws = JSON.parse(readFileSync(fixturePath, "utf8")) as { chain: string; wallet: string };
if (!ws.chain || !ws.wallet) {
  console.error(`${fixturePath} does not look like a WalletScore: missing chain or wallet`);
  process.exit(1);
}

const runId = "fixture-base";
const now = new Date().toISOString();
const candidates = JSON.stringify([{ wallet: ws.wallet }]);
const result = JSON.stringify(ws);

const escape = (s: string) => s.replace(/'/g, "''");

const jobSql = `INSERT OR REPLACE INTO scan_jobs (run_id, chain, source, status, created_at, started_at, finished_at, candidates, published) VALUES ('${runId}', '${escape(ws.chain)}', 'cron', 'done', '${now}', '${now}', '${now}', '${escape(candidates)}', 1);`;
const scoreSql = `INSERT OR REPLACE INTO scores (chain, wallet, run_id, computed_at, provisional, result) VALUES ('${escape(ws.chain)}', '${escape(ws.wallet)}', '${runId}', '${now}', 0, '${escape(result)}');`;

console.log(jobSql);
console.log(scoreSql);

const local = process.env.ZATTO_LOCAL === "1";
const scopeFlag = local ? "--local" : "--remote";

for (const sql of [jobSql, scoreSql]) {
  execFileSync("npx", ["wrangler", "d1", "execute", "zatto", scopeFlag, "--command", sql], { stdio: "inherit" });
}
