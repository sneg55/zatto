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
        const rows = heavy ? Array.from({ length: 20 }, (_, i) => prof("0xt" + i, `2026-09-1${i % 5}T0${i % 9}:00:00Z`)) : [prof("0xt1", "2026-09-10T10:00:00Z")];
        return { status: 200, body: { data: rows, pagination: { page: 1, per_page: 100, is_last_page: true } } };
      }
      throw new Error("unexpected " + url);
    });
    const client = new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 3000, sleep: async () => {} });
    const full = await planJob(db, client, "base", now, 10_000);
    expect(full.candidates.map((c) => c.wallet)).toEqual(["0xa", "0xb"]);
    expect(full.candidates[0].buys.length).toBe(10);
    expect(full.candidates[0].buckets.length).toBe(30);
    expect(full.plannedRequests).toBe(7 + 30 * 2 + 10 + 3 * 2 + 1);
    const capped = await planJob(db, client, "base", now, 20);
    expect(capped.candidates.find((c) => c.wallet === "0xa")?.dropped).toMatch(/cap/);
    expect(capped.candidates.find((c) => c.wallet === "0xb")?.dropped).toBeUndefined();
  });

  it("charges one candle call per buy so the planned figure bounds what the step actually spends", async () => {
    const db = openTestDb();
    const f = fetchStub((url, init) => {
      const body = JSON.parse(String(init.body));
      if (url.endsWith("token-screener")) return { status: 200, body: { data: [{ token_address: "0xT1" }], pagination: { page: 1, per_page: 30, is_last_page: true } } };
      if (url.endsWith("tgm/dex-trades")) return { status: 200, body: { data: [trade("0xA")], pagination: { page: 1, per_page: 1000, is_last_page: true } } };
      if (url.endsWith("profiler/dex-trades")) {
        void body;
        return { status: 200, body: { data: [prof("0xtok", "2026-09-13T10:00:00Z"), prof("0xtok", "2026-09-13T11:00:00Z"), prof("0xtok", "2026-09-13T12:00:00Z")], pagination: { page: 1, per_page: 100, is_last_page: true } } };
      }
      throw new Error("unexpected " + url);
    });
    const client = new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 3000, sleep: async () => {} });
    const plan = await planJob(db, client, "base", now, 10_000);
    expect(plan.candidates[0].buys.length).toBe(3);
    expect(plan.candidates[0].buckets.length).toBe(5);
    expect(plan.plannedRequests).toBe(4 + 5 * 2 + 3);
  });

  it("the plan phase fits its own request budget, reserving two calls per wallet, and never replans discovery from zero", async () => {
    const db = openTestDb();
    const wallets = Array.from({ length: 12 }, (_, i) => "0xw" + i);
    const f = fetchStub((url) => {
      if (url.endsWith("token-screener")) return { status: 200, body: { data: Array.from({ length: 30 }, (_, i) => ({ token_address: "0xT" + i })), pagination: { page: 1, per_page: 30, is_last_page: true } } };
      if (url.endsWith("tgm/dex-trades")) return { status: 200, body: { data: wallets.map((w) => trade(w)), pagination: { page: 1, per_page: 1000, is_last_page: true } } };
      if (url.endsWith("profiler/dex-trades")) return { status: 200, body: { data: [prof("0xtok", "2026-09-13T10:00:00Z")], pagination: { page: 1, per_page: 100, is_last_page: true } } };
      throw new Error("unexpected " + url);
    });
    const client = new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 3000, sleep: async () => {} });
    const first = await planJob(db, client, "base", now, 10_000);
    expect(client.requests).toBe(40);
    expect(first.candidates.length).toBe(5);
    expect(first.candidates.every((c) => c.buys.length === 1)).toBe(true);

    const replan = await planJob(db, client, "base", now, 10_000);
    expect(client.requests - 40).toBe(40);
    expect(replan.candidates.length).toBe(10);
    expect(replan.candidates.every((c) => c.buys.length === 1)).toBe(true);
  });

  it("stops discovery when the step has run out of wall clock and still returns a usable plan", async () => {
    const db = openTestDb();
    const f = fetchStub((url) => {
      if (url.endsWith("token-screener")) return { status: 200, body: { data: Array.from({ length: 30 }, (_, i) => ({ token_address: "0xT" + i })), pagination: { page: 1, per_page: 30, is_last_page: true } } };
      if (url.endsWith("tgm/dex-trades")) return { status: 200, body: { data: [trade("0xA")], pagination: { page: 1, per_page: 1000, is_last_page: true } } };
      if (url.endsWith("profiler/dex-trades")) return { status: 200, body: { data: [prof("0xtok", "2026-09-13T10:00:00Z")], pagination: { page: 1, per_page: 100, is_last_page: true } } };
      throw new Error("unexpected " + url);
    });
    const client = new NansenClient({ db, apiKey: "k", fetch: f, now: () => now, budget: 3000, sleep: async () => {} });
    let calls = 0;
    const plan = await planJob(db, client, "base", now, 10_000, { expired: () => ++calls > 3 });
    expect(client.requests).toBe(1 + 3 + 2);
    expect(plan.candidates.map((c) => c.wallet)).toEqual(["0xa"]);
    expect(plan.candidates[0].buys.length).toBe(1);
  });
});
