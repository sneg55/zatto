import { describe, it, expect } from "vitest";
import { copiedBoard, persistence, type WalletHistory } from "@/lib/score/copied";
import type { BuyScore } from "@/lib/score/types";

function buy(p: { token: string; ts: string; burst: number; crowded: boolean; d24?: number | null; usable?: boolean }): BuyScore {
  return {
    tx: `0x${p.token}${p.ts}`, token: p.token, ts: p.ts,
    baselineRate: 4, newBuyers: { m10: 2, m30: 3, m60: 4 }, fastShare: 0.5,
    crowdRatio: p.burst, crowdRatio10: p.burst, crowded: p.crowded,
    fillPrice: 1, entryPrice: 1,
    leaderReturn: { h1: 0, h24: 0 }, delayedReturn: { h1: 0, h24: p.d24 === undefined ? 0.1 : p.d24 },
    mature: true, usable: p.usable ?? true, exclusion: null,
  };
}

function snap(wallet: string, buys: BuyScore[], computedAt = "2026-09-16T00:00:00.000Z"): WalletHistory {
  return { wallet, computedAt, buys };
}

const ts = (n: number) => `2026-09-1${n}T10:00:00.000Z`;
const run = (wallet: string, returns: number[], burst = 1) =>
  snap(wallet, returns.map((d24, i) => buy({ token: `0x${wallet}${i}`, ts: ts(i % 10), burst, crowded: burst >= 3, d24 })));

describe("copiedBoard", () => {
  it("ranks by what copying returned, not by how crowded the wallet was", () => {
    const loud = snap("0xloud", [
      buy({ token: "0xa", ts: ts(1), burst: 20, crowded: true, d24: -0.4 }),
      buy({ token: "0xb", ts: ts(2), burst: 20, crowded: true, d24: -0.3 }),
      buy({ token: "0xc", ts: ts(3), burst: 20, crowded: true, d24: -0.2 }),
      buy({ token: "0xd", ts: ts(4), burst: 20, crowded: true, d24: -0.1 }),
      buy({ token: "0xe", ts: ts(5), burst: 20, crowded: true, d24: -0.5 }),
      buy({ token: "0xf", ts: ts(6), burst: 20, crowded: true, d24: -0.6 }),
    ]);
    const quiet = run("0xquiet", [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const rows = copiedBoard([loud, quiet]);
    expect(rows[0].wallets[0]).toBe("0xquiet");
    expect(rows[0].copyReturn).toBeCloseTo(0.35);
    expect(rows[0].copyHigher).toBe(6);
    expect(rows[1].maxBurst).toBe(20);
  });

  it("puts every actor under the buy floor below every actor above it, however well it did", () => {
    const lucky = snap("0xlucky", [buy({ token: "0xz", ts: ts(1), burst: 1, crowded: false, d24: 9 })]);
    const steady = run("0xsteady", [0.01, 0.02, 0.03, 0.04, 0.05, 0.06]);
    const rows = copiedBoard([lucky, steady]);
    expect(rows.map((r) => r.wallets[0])).toEqual(["0xsteady", "0xlucky"]);
    expect(rows[0].qualifies).toBe(true);
    expect(rows[1].qualifies).toBe(false);
    expect(rows[1].copyN).toBe(1);
  });

  it("counts an unpriced buy in the burst columns but not in the copy return", () => {
    const rows = copiedBoard([snap("0xa", [
      buy({ token: "0xa", ts: ts(1), burst: 4, crowded: true, d24: 0.2 }),
      buy({ token: "0xb", ts: ts(2), burst: 4, crowded: true, d24: null }),
    ])]);
    expect(rows[0].buys).toBe(2);
    expect(rows[0].crowded).toBe(2);
    expect(rows[0].copyN).toBe(1);
    expect(rows[0].copyReturn).toBeCloseTo(0.2);
  });

  it("collapses wallets that share a buy list into one row rather than repeating one actor", () => {
    const shared = [
      buy({ token: "0xt1", ts: "2026-09-10T10:00:00.000Z", burst: 9, crowded: true }),
      buy({ token: "0xt2", ts: "2026-09-11T10:00:00.000Z", burst: 1, crowded: false }),
    ];
    const rows = copiedBoard([snap("0xb", shared), snap("0xa", shared), snap("0xc", shared)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].wallets).toEqual(["0xa", "0xb", "0xc"]);
    expect(rows[0].buys).toBe(2);
    expect(rows[0].crowded).toBe(1);
  });

  it("does not collapse two wallets whose buy lists only overlap", () => {
    const one = buy({ token: "0xt1", ts: "2026-09-10T10:00:00.000Z", burst: 9, crowded: true });
    const other = buy({ token: "0xt2", ts: "2026-09-11T10:00:00.000Z", burst: 2, crowded: false });
    expect(copiedBoard([snap("0xa", [one]), snap("0xb", [one, other])])).toHaveLength(2);
  });

  it("medians the delayed return over crowded buys only, ignoring the ones with no price", () => {
    const rows = copiedBoard([snap("0xa", [
      buy({ token: "0xt1", ts: "2026-09-10T10:00:00.000Z", burst: 4, crowded: true, d24: 0.2 }),
      buy({ token: "0xt2", ts: "2026-09-10T11:00:00.000Z", burst: 4, crowded: true, d24: 0.6 }),
      buy({ token: "0xt3", ts: "2026-09-10T12:00:00.000Z", burst: 4, crowded: true, d24: null }),
      buy({ token: "0xt4", ts: "2026-09-10T13:00:00.000Z", burst: 1, crowded: false, d24: -0.9 }),
    ])]);
    expect(rows[0].crowdedDelayed24h).toBeCloseTo(0.4);
    expect(rows[0].medianBurst).toBeCloseTo(4);
    expect(rows[0].newestBuy).toBe("2026-09-10T13:00:00.000Z");
  });

  it("drops unusable buys and snapshots scored before the burst ratio existed", () => {
    const legacy = { ...buy({ token: "0xt1", ts: "2026-09-10T10:00:00.000Z", burst: 4, crowded: true }) } as Partial<BuyScore>;
    delete legacy.crowdRatio10;
    const rows = copiedBoard([
      snap("0xa", [legacy as BuyScore]),
      snap("0xb", [buy({ token: "0xt2", ts: "2026-09-10T11:00:00.000Z", burst: 4, crowded: true, usable: false })]),
      snap("0xc", [buy({ token: "0xt3", ts: "2026-09-10T12:00:00.000Z", burst: 4, crowded: true })]),
    ]);
    expect(rows.map((r) => r.wallets[0])).toEqual(["0xc"]);
  });
});

describe("persistence", () => {
  const rising = (w: string, early: number[], late: number[]) =>
    snap(w, [...early, ...late].map((d24, i) => buy({ token: `0x${w}${i}`, ts: `2026-09-${String(10 + i).padStart(2, "0")}T10:00:00.000Z`, burst: 1, crowded: false, d24 })));

  it("splits each actor in half by time and pools the later buys of the early leaders", () => {
    const good = rising("a", [0.5, 0.6, 0.7], [0.4, 0.5, 0.6]);
    const bad = rising("b", [-0.5, -0.6, -0.7], [-0.4, -0.5, -0.6]);
    const p = persistence([good, bad], 1);
    expect(p.actors).toBe(2);
    expect(p.topActors).toBe(1);
    expect(p.topLater).toBe(3);
    expect(p.topLaterMedian).toBeCloseTo(0.5);
    expect(p.topLaterHigher).toBe(3);
    expect(p.restLaterMedian).toBeCloseTo(-0.5);
    expect(p.restLaterHigher).toBe(0);
  });

  it("ignores actors under the buy floor so the test covers what the board ranks", () => {
    const thin = rising("c", [0.9], [0.9]);
    expect(persistence([thin]).actors).toBe(0);
  });

  it("reports a rank correlation between early and late performance", () => {
    const p = persistence([
      rising("a", [0.5, 0.6, 0.7], [0.5, 0.6, 0.7]),
      rising("b", [0.1, 0.2, 0.3], [0.1, 0.2, 0.3]),
      rising("c", [-0.5, -0.4, -0.3], [-0.5, -0.4, -0.3]),
    ], 1);
    expect(p.spearman).toBeCloseTo(1);
  });
});
