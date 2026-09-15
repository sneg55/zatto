import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { NansenClient } from "@/lib/nansen/client";
import { fetchWalletBuys, scorableCutoff } from "@/lib/nansen/endpoints";
import { loadBuys } from "@/lib/db/queries";
import { MAX_BUYS_PER_WALLET } from "@/lib/score/constants";

const W = "0x" + "d".repeat(40);
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const prof = (tok: string, ts: string) => ({ chain: "base", block_timestamp: ts, transaction_hash: `0x${tok}${ts}`, trader_address: W, token_bought_address: tok, token_sold_address: USDC, token_bought_amount: 10, token_sold_amount: 1, token_bought_symbol: "T", token_sold_symbol: "USDC", trade_value_usd: 10 });

const now = new Date("2026-09-15T12:00:00Z");
const young = ["2026-09-15T11:00:00Z", "2026-09-15T02:00:00Z", "2026-09-14T14:00:00Z"];
const mature = Array.from({ length: 12 }, (_, i) => `2026-09-${String(14 - i).padStart(2, "0")}T09:00:00Z`);

function client(db: ReturnType<typeof openTestDb>) {
  const f = fetchStub([{ status: 200, body: { data: [...young, ...mature].map((ts, i) => prof("0xt" + i, ts)), pagination: { page: 1, per_page: 100, is_last_page: true } } }]);
  return { f, c: new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 3000, sleep: async () => {} }) };
}

describe("fetchWalletBuys maturity window", () => {
  it("the cutoff is 24 hours and 15 minutes before now", () => {
    expect(scorableCutoff(now)).toBe("2026-09-14T11:45:00.000Z");
  });

  it("scoring gets only buys whose 24h candle can be final, and gets a full cohort of them", async () => {
    const db = openTestDb();
    const { c } = client(db);
    const buys = await fetchWalletBuys(c, db, "base", W, now);
    expect(buys.length).toBe(MAX_BUYS_PER_WALLET);
    expect(buys.every((b) => b.ts <= scorableCutoff(now))).toBe(true);
    expect(buys[0].ts).toBe("2026-09-14T09:00:00.000Z");
  });

  it("the recent panel still sees the newest buy even though it is minutes old", async () => {
    const db = openTestDb();
    const { c } = client(db);
    const buys = await fetchWalletBuys(c, db, "base", W, now, "recent");
    expect(buys[0].ts).toBe("2026-09-15T11:00:00.000Z");
  });

  it("both sets are persisted, so the ten minute cached path serves each caller the right ones", async () => {
    const db = openTestDb();
    const { c } = client(db);
    await fetchWalletBuys(c, db, "base", W, now);
    const panel = await loadBuys(db, "base", W, MAX_BUYS_PER_WALLET);
    expect(panel[0].ts).toBe("2026-09-15T11:00:00.000Z");
    const scoring = await loadBuys(db, "base", W, MAX_BUYS_PER_WALLET, scorableCutoff(now));
    expect(scoring.length).toBe(MAX_BUYS_PER_WALLET);
    expect(scoring.every((b) => b.ts <= scorableCutoff(now))).toBe(true);
  });
});
