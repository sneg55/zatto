import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub } from "../helpers/fetchStub";
import { NansenClient } from "@/lib/nansen/client";
import { fetchDiscoveryTokens, interleave } from "@/lib/nansen/endpoints";
import { FRESH_TOKEN_MAX_AGE_DAYS } from "@/lib/score/constants";

describe("interleave", () => {
  it("alternates the two sources so neither can fill the budget alone", () => {
    expect(interleave(["f1", "f2", "f3"], ["e1", "e2", "e3"], 4)).toEqual(["f1", "e1", "f2", "e2"]);
  });

  it("drops a token present in both sources and falls back to the longer list", () => {
    expect(interleave(["a"], ["a", "b", "c"], 3)).toEqual(["a", "b", "c"]);
  });
});

describe("fetchDiscoveryTokens", () => {
  it("asks the screener for fresh tokens as well as the highest volume ones", async () => {
    const db = openTestDb();
    let call = 0;
    const f = fetchStub(() => {
      const prefix = call++ === 0 ? "0xfresh" : "0xold";
      return { status: 200, body: { data: Array.from({ length: 30 }, (_, i) => ({ token_address: prefix + i })), pagination: { page: 1, per_page: 30, is_last_page: true } } };
    });
    const client = new NansenClient({ db, apiKey: "k", fetch: f, now: () => new Date("2026-09-15T12:00:00Z"), budget: 3000, sleep: async () => {} });
    const tokens = await fetchDiscoveryTokens(client, "base", 6);
    expect(tokens).toEqual(["0xfresh0", "0xold0", "0xfresh1", "0xold1", "0xfresh2", "0xold2"]);
    const freshBody = JSON.parse(String(f.calls[0].init.body)) as { filters: { token_age_days?: { max: number } } };
    expect(freshBody.filters.token_age_days).toEqual({ min: 0, max: FRESH_TOKEN_MAX_AGE_DAYS });
    const oldBody = JSON.parse(String(f.calls[1].init.body)) as { filters: { token_age_days?: unknown } };
    expect(oldBody.filters.token_age_days).toBeUndefined();
  });
});
