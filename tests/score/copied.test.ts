import { describe, it, expect } from "vitest";
import { copiedBoard, type ScoredSnapshot } from "@/lib/score/copied";
import { scoreWallet } from "@/lib/score/perWallet";
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

function snap(wallet: string, buys: BuyScore[], computedAt = "2026-09-16T00:00:00.000Z"): ScoredSnapshot {
  return { wallet, computedAt, score: scoreWallet("base", wallet, buys) };
}

describe("copiedBoard", () => {
  it("ranks by crowded buys, then by the hardest burst", () => {
    const a = snap("0xa", [buy({ token: "0xt1", ts: "2026-09-10T10:00:00.000Z", burst: 9, crowded: true })]);
    const b = snap("0xb", [
      buy({ token: "0xt2", ts: "2026-09-10T11:00:00.000Z", burst: 4, crowded: true }),
      buy({ token: "0xt3", ts: "2026-09-10T12:00:00.000Z", burst: 5, crowded: true }),
    ]);
    const c = snap("0xc", [buy({ token: "0xt4", ts: "2026-09-10T13:00:00.000Z", burst: 1, crowded: false })]);
    expect(copiedBoard([a, c, b]).map((r) => r.wallets[0])).toEqual(["0xb", "0xa", "0xc"]);
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
