import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { NansenClient } from "@/lib/nansen/client";
import { planJob } from "@/lib/jobs/planner";

const now = new Date("2026-09-15T12:00:00Z");
const trade = (who: string, ts = "2026-09-14T10:00:00Z") => ({ block_timestamp: ts, transaction_hash: "0x" + who + ts, trader_address: who, trader_address_label: "Smart Trader", action: "BUY", estimated_swap_price_usd: 1, estimated_value_usd: 10 });
const prof = (tok: string, ts: string) => ({ chain: "base", block_timestamp: ts, transaction_hash: "0x" + tok + ts, trader_address: "w", token_bought_address: tok, token_sold_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", token_bought_amount: 10, token_sold_amount: 1, token_bought_symbol: "T", token_sold_symbol: "USDC", trade_value_usd: 10 });

describe("planJob", () => {
  it("discovers tokens then wallets, keeps top wallets by buys, counts missing buckets, drops the heaviest wallet over the cap", async () => {
    const db = openTestDb();
    const f = fetchStub((url, init) => {
      const body = JSON.parse(String(init.body));
      if (url.endsWith("token-screener")) return { status: 200, body: { data: [{ token_address: "0xT1" }, { token_address: "0xT2" }], pagination: { page: 1, per_page: 30, is_last_page: true } } };
      if (url.endsWith("tgm/dex-trades")) return { status: 200, body: { data: [trade("0xA"), trade("0xA", "2026-09-14T11:00:00Z"), trade("0xB")], pagination: { page: 1, per_page: 1000, is_last_page: true } } };
      if (url.endsWith("profiler/dex-trades")) {
        const heavy = body.address === "0xa";
        const rows = heavy ? Array.from({ length: 20 }, (_, i) => prof("0xt" + i, `2026-09-1${i % 5}T0${i % 9}:00:00Z`)) : [prof("0xt1", "2026-09-14T10:00:00Z")];
        return { status: 200, body: { data: rows, pagination: { page: 1, per_page: 100, is_last_page: true } } };
      }
      throw new Error("unexpected " + url);
    });
    const client = new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 3000, sleep: async () => {} });
    const full = await planJob(db, client, "base", now, 10_000, 25);
    expect(full.candidates.map((c) => c.wallet)).toEqual(["0xa", "0xb"]);
    expect(full.candidates[0].buckets.length).toBe(60);
    expect(full.plannedRequests).toBeGreaterThan(60);
    const capped = await planJob(db, client, "base", now, 20, 25);
    expect(capped.candidates.find((c) => c.wallet === "0xa")?.dropped).toMatch(/cap/);
    expect(capped.candidates.find((c) => c.wallet === "0xb")?.dropped).toBeUndefined();
  });
});
