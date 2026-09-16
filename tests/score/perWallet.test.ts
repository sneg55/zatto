import { describe, it, expect } from "vitest";
import { burstDistribution, clusters, pooledRun, scoreWallet, sortLeaderboard, tokenBreakdown } from "@/lib/score/perWallet";
import type { BuyScore } from "@/lib/score/types";

let seq = 0;

function mk(p: Partial<BuyScore> & { crowded: boolean; d24?: number | null }): BuyScore {
  const minute = String(seq++ % 60).padStart(2, "0");
  return {
    tx: p.tx ?? Math.random().toString(36), token: p.token ?? "0xa", ts: p.ts ?? `2026-09-10T00:${minute}:00.000Z`,
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

describe("one observation per token minute", () => {
  it("counts a fleet entering one token minute once, however many wallets carried it", () => {
    const ts = "2026-09-12T10:00:00.000Z";
    const fleet = ["0xa", "0xb", "0xc", "0xd"].map((w) =>
      scoreWallet("base", w, [
        mk({ crowded: true, token: "0xhot", ts, crowdRatio10: 9, d24: 0.5 }),
        mk({ crowded: false, token: "0xcalm", ts: "2026-09-12T11:00:00.000Z", crowdRatio10: 1, d24: -0.1 }),
      ]));
    const pooled = pooledRun(fleet);
    expect(pooled.buys).toBe(2);
    expect(pooled.walletBuys).toBe(8);
    expect(pooled.nCrowded).toBe(1);
    expect(pooled.crowdedEvents).toBe(1);
    const [hot] = tokenBreakdown(fleet);
    expect(hot.buys).toBe(1);
    expect(hot.wallets).toBe(4);
    expect(hot.entries).toHaveLength(4);
  });

  it("keeps two entries into one token at different minutes as two observations", () => {
    const w = scoreWallet("base", "0xa", [
      mk({ crowded: true, token: "0xhot", ts: "2026-09-12T10:00:00.000Z", crowdRatio10: 9 }),
      mk({ crowded: true, token: "0xhot", ts: "2026-09-12T10:01:00.000Z", crowdRatio10: 9 }),
    ]);
    expect(pooledRun([w]).buys).toBe(2);
    expect(tokenBreakdown([w])[0].buys).toBe(2);
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

describe("burstDistribution and tokenBreakdown", () => {
  it("places every scored buy in exactly one band", () => {
    const bands = burstDistribution([0.4, 1, 1.9, 2, 2.99, 3, 4.9, 5, 17.57]);
    expect(bands.map((b) => b.count)).toEqual([1, 2, 2, 2, 2]);
    expect(bands.reduce((n, b) => n + b.count, 0)).toBe(9);
  });

  it("groups scored buys by token and ranks the crowded ones first", () => {
    const quiet = scoreWallet("base", "0xa", [
      mk({ crowded: false, token: "0xcalm", ts: "2026-09-11T10:00:00.000Z", d24: -0.1 }),
      mk({ crowded: false, token: "0xcalm", ts: "2026-09-11T12:00:00.000Z", d24: -0.2 }),
      mk({ crowded: true, token: "0xhot", ts: "2026-09-12T10:00:00.000Z", d24: 0.5 }),
    ]);
    const peer = scoreWallet("base", "0xb", [mk({ crowded: true, token: "0xhot", ts: "2026-09-12T10:00:00.000Z", d24: 0.5 })]);
    const rows = tokenBreakdown([quiet, peer]);
    expect(rows[0].token).toBe("0xhot");
    expect(rows[0].crowded).toBe(1);
    expect(rows[0].wallets).toBe(2);
    expect(rows[0].events).toBe(1);
    expect(rows[0].entries).toHaveLength(2);
    expect(rows[1].token).toBe("0xcalm");
    expect(rows[1].medianDelayed24h).toBeCloseTo(-0.15);
  });

  it("calls a token CROWDED on a single crowded entry and ranks by the hardest burst", () => {
    const one = scoreWallet("base", "0xa", [
      mk({ crowded: true, token: "0xspike", ts: "2026-09-12T10:00:00.000Z", crowdRatio10: 35 }),
      mk({ crowded: true, token: "0xsteady", ts: "2026-09-12T11:00:00.000Z", crowdRatio10: 4 }),
      mk({ crowded: true, token: "0xsteady", ts: "2026-09-12T12:00:00.000Z", crowdRatio10: 5 }),
      mk({ crowded: false, token: "0xcalm", ts: "2026-09-12T13:00:00.000Z", crowdRatio10: 0.5 }),
    ]);
    const rows = tokenBreakdown([one]);
    expect(rows.map((r) => r.token)).toEqual(["0xspike", "0xsteady", "0xcalm"]);
    expect(rows.map((r) => r.verdict)).toEqual(["CROWDED", "CROWDED", "QUIET"]);
    expect(rows[0].maxBurst).toBe(35);
    expect(rows[0].buys).toBe(1);
    expect(rows[1].maxBurst).toBe(5);
  });

  it("nests every entry under its token, hardest burst first, with the buying wallet", () => {
    const a = scoreWallet("base", "0xa", [mk({ crowded: false, token: "0xhot", ts: "2026-09-12T10:00:00.000Z", crowdRatio10: 2, d24: 0.1 })]);
    const b = scoreWallet("base", "0xb", [mk({ crowded: true, token: "0xhot", ts: "2026-09-12T11:00:00.000Z", crowdRatio10: 8, d24: 0.4 })]);
    const [hot] = tokenBreakdown([a, b]);
    expect(hot.entries.map((e) => e.wallet)).toEqual(["0xb", "0xa"]);
    expect(hot.entries[0]).toMatchObject({ burst: 8, crowded: true, delayed24h: 0.4, ts: "2026-09-12T11:00:00.000Z" });
    expect(hot.newest).toBe("2026-09-12T11:00:00.000Z");
  });
});

describe("evidence window", () => {
  it("reports the newest, median and oldest scored buy in the run", () => {
    const a = scoreWallet("base", "0xa", [
      mk({ crowded: false, ts: "2026-09-01T00:00:00.000Z" }),
      mk({ crowded: false, ts: "2026-09-05T00:00:00.000Z" }),
      mk({ crowded: false, ts: "2026-09-09T00:00:00.000Z" }),
      mk({ crowded: false, ts: "2026-09-12T00:00:00.000Z", usable: false, exclusion: "immature", mature: false }),
    ]);
    expect(pooledRun([a]).evidence).toEqual({
      newest: "2026-09-09T00:00:00.000Z",
      median: "2026-09-05T00:00:00.000Z",
      oldest: "2026-09-01T00:00:00.000Z",
    });
  });

  it("reports nulls when the run scored nothing", () => {
    expect(pooledRun([]).evidence).toEqual({ newest: null, median: null, oldest: null });
  });
});
