import { describe, it, expect } from "vitest";
import { clusters, pooledRun, scoreWallet, sortLeaderboard } from "@/lib/score/perWallet";
import type { BuyScore } from "@/lib/score/types";

function mk(p: Partial<BuyScore> & { crowded: boolean; d24?: number | null }): BuyScore {
  return {
    tx: p.tx ?? Math.random().toString(36), token: p.token ?? "0xa", ts: p.ts ?? "2026-09-10T00:00:00.000Z",
    baselineRate: p.baselineRate ?? 4, newBuyers: p.newBuyers ?? { m10: 2, m30: 4, m60: p.crowded ? 15 : 3 },
    fastShare: p.fastShare !== undefined ? p.fastShare : 0.5, crowdRatio: p.crowded ? 3.75 : 0.75, crowdRatio10: p.crowdRatio10 ?? (p.crowded ? 4.5 : 0.9), crowded: p.crowded,
    fillPrice: 1, entryPrice: 1.01,
    leaderReturn: { h1: 0.01, h24: p.d24 ?? 0.02 }, delayedReturn: { h1: 0.0, h24: p.d24 === undefined ? 0.01 : p.d24 },
    mature: p.mature ?? true, usable: p.usable ?? true, exclusion: p.exclusion ?? null,
  };
}

describe("scoreWallet", () => {
  it("is THIN under the usable-buy floor and counts exclusions", () => {
    const s = scoreWallet("base", "0xw", [mk({ crowded: true }), mk({ crowded: true, usable: false, exclusion: "capped" }), mk({ crowded: false, usable: false, exclusion: "immature", mature: false })]);
    expect(s.verdict).toBe("THIN"); expect(s.n).toBe(1); expect(s.excluded).toEqual({ capped: 1, immature: 1, noPrice: 0 });
    expect(s.provisional).toBe(true);
  });
  it("is CROWDED when more than half of usable buys are crowded, regardless of returns", () => {
    const s = scoreWallet("base", "0xw", [mk({ crowded: true, d24: 0.5 }), mk({ crowded: true, d24: 0.4 }), mk({ crowded: true, d24: 0.3 }), mk({ crowded: false, d24: -0.1 }), mk({ crowded: false, d24: -0.2 }), mk({ crowded: false, d24: -0.3 })]);
    expect(s.verdict).toBe("QUIET");
    const c = scoreWallet("base", "0xw", [mk({ crowded: true }), mk({ crowded: true }), mk({ crowded: true }), mk({ crowded: true }), mk({ crowded: false }), mk({ crowded: false })]);
    expect(c.verdict).toBe("CROWDED"); expect(c.crowdedShare).toBeCloseTo(4 / 6);
  });
  it("states a group median only with 3 or more buys and writes the return note accordingly", () => {
    const s = scoreWallet("base", "0xw", [mk({ crowded: true, d24: 0.1 }), mk({ crowded: true, d24: 0.2 }), mk({ crowded: false, d24: -0.1 }), mk({ crowded: false, d24: -0.2 }), mk({ crowded: false, d24: -0.3 })]);
    expect(s.delayed24h.crowded.insufficient).toBe(true);
    expect(s.delayed24h.uncrowded.median).toBeCloseTo(-0.2);
    expect(s.returnNote).toMatch(/not enough mature buys/);
    const t = scoreWallet("base", "0xw", [mk({ crowded: true, d24: 0.1 }), mk({ crowded: true, d24: 0.2 }), mk({ crowded: true, d24: 0.3 }), mk({ crowded: false, d24: -0.1 }), mk({ crowded: false, d24: -0.2 }), mk({ crowded: false, d24: -0.3 })]);
    expect(t.returnNote).toMatch(/delayed entry after crowded buys returned \+20\.0% vs -20\.0% after quiet buys/);
  });
  it("ignores null returns inside a group and null fast shares in the mean", () => {
    const s = scoreWallet("base", "0xw", [mk({ crowded: true, d24: null, fastShare: null }), mk({ crowded: true, d24: 0.2 }), mk({ crowded: true, d24: 0.4 }), mk({ crowded: true, d24: 0.6 }), mk({ crowded: false }), mk({ crowded: false })]);
    expect(s.delayed24h.crowded.n).toBe(3); expect(s.delayed24h.crowded.median).toBeCloseTo(0.4);
    expect(s.fastShare.contributing).toBe(5);
  });
  it("median of new buyers and distinct tokens", () => {
    const s = scoreWallet("base", "0xw", [mk({ crowded: true, token: "a" }), mk({ crowded: false, token: "b" }), mk({ crowded: false, token: "b" }), mk({ crowded: false, token: "c" }), mk({ crowded: false, token: "c" })]);
    expect(s.newBuyersPerBuy).toBe(3); expect(s.tokens).toBe(3);
  });
});

describe("sortLeaderboard", () => {
  it("orders CROWDED, QUIET, THIN then new buyers desc, n desc, address, nulls last", () => {
    const base = scoreWallet("base", "0xb", [mk({ crowded: false }), mk({ crowded: false }), mk({ crowded: false }), mk({ crowded: false }), mk({ crowded: false })]);
    const crowded = { ...scoreWallet("base", "0xa", [mk({ crowded: true }), mk({ crowded: true }), mk({ crowded: true }), mk({ crowded: false }), mk({ crowded: false })]) };
    const thin = scoreWallet("base", "0xc", [mk({ crowded: true })]);
    const nul = { ...base, wallet: "0xd", newBuyersPerBuy: null };
    expect(sortLeaderboard([nul, thin, base, crowded]).map((r) => r.wallet)).toEqual(["0xa", "0xb", "0xd", "0xc"]);
  });
});

describe("pooledRun", () => {
  it("pools every usable buy in the run so the comparison survives a thin per wallet split", () => {
    const a = scoreWallet("base", "0xa", [mk({ crowded: true, d24: 0.1 }), mk({ crowded: false, d24: -0.02 }), mk({ crowded: false, d24: -0.04 }), mk({ crowded: false, d24: -0.06 })]);
    const b = scoreWallet("base", "0xb", [mk({ crowded: true, d24: 0.2 }), mk({ crowded: true, d24: 0.3 }), mk({ crowded: false, d24: 0.0 }), mk({ crowded: false, d24: 0.02 })]);
    expect(a.delayed24h.crowded.insufficient).toBe(true);
    const pooled = pooledRun([a, b]);
    expect(pooled.buys).toBe(8);
    expect(pooled.nCrowded).toBe(3);
    expect(pooled.crowded.insufficient).toBe(false);
    expect(pooled.crowded.median).toBeCloseTo(0.2);
    expect(pooled.uncrowded.median).toBeCloseTo(-0.02);
  });

  it("reports the burst ratio distribution over the run", () => {
    const rows = [scoreWallet("base", "0xa", [mk({ crowded: false, crowdRatio10: 1 }), mk({ crowded: false, crowdRatio10: 2 }), mk({ crowded: false, crowdRatio10: 3 }), mk({ crowded: false, crowdRatio10: 9 })])];
    const pooled = pooledRun(rows);
    expect(pooled.burst.median).toBeCloseTo(2.5);
    expect(pooled.burst.max).toBe(9);
  });
});

describe("clusters", () => {
  it("names wallets whose scored buys are the same token minutes", () => {
    const shape = [mk({ crowded: true, token: "0xa", ts: "2026-09-11T20:55:00.000Z" }), mk({ crowded: false, token: "0xb", ts: "2026-09-12T20:47:00.000Z" })];
    const a = scoreWallet("base", "0xa", shape);
    const b = scoreWallet("base", "0xb", shape);
    const lone = scoreWallet("base", "0xc", [mk({ crowded: false, token: "0xz", ts: "2026-09-13T01:00:00.000Z" })]);
    const found = clusters([a, b, lone]);
    expect(found.get("0xa")).toBe(2);
    expect(found.get("0xb")).toBe(2);
    expect(found.has("0xc")).toBe(false);
  });
});
