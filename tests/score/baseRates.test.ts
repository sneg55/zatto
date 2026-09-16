import { describe, it, expect } from "vitest";
import { bandFor, baseRates, rateFor, settledObservations } from "@/lib/score/baseRates";
import { MIN_RATE_OBSERVATIONS } from "@/lib/score/constants";
import type { BuyScore } from "@/lib/score/types";

function obs(burst: number, d24: number | null, token = "0xt", usable = true): BuyScore {
  return {
    tx: `0x${burst}${d24}${token}`, token, ts: "2026-09-10T00:00:00.000Z",
    baselineRate: 4, newBuyers: { m10: 1, m30: 1, m60: 1 }, fastShare: null,
    crowdRatio: burst, crowdRatio10: burst, crowded: burst >= 3,
    fillPrice: 1, entryPrice: 1,
    leaderReturn: { h1: null, h24: null }, delayedReturn: { h1: null, h24: d24 },
    mature: true, usable, exclusion: null,
  };
}

const band = (rates: ReturnType<typeof baseRates>, label: string) => rates.find((r) => r.label === label)!;

describe("baseRates", () => {
  it("places a burst in exactly one band, with the top band open ended", () => {
    expect(bandFor(0.9).label).toBe("under 1x");
    expect(bandFor(1).label).toBe("1 to 2x");
    expect(bandFor(2.99).label).toBe("2 to 3x");
    expect(bandFor(3).label).toBe("3 to 5x");
    expect(bandFor(5).label).toBe("5x and up");
    expect(bandFor(38.5).label).toBe("5x and up");
  });

  it("leaves out entries that never settled a price or were not usable", () => {
    const kept = settledObservations([obs(9, 0.2), obs(9, null), obs(9, 0.3, "0xt", false)]);
    expect(kept).toHaveLength(1);
  });

  it("counts how many were higher at 24 hours and keeps the worst one", () => {
    const rates = baseRates([obs(9, 0.5, "0xa"), obs(9, 0.2, "0xb"), obs(9, -0.7, "0xc"), obs(9, 0.1, "0xd")]);
    const top = band(rates, "5x and up");
    expect(top.n).toBe(4);
    expect(top.tokens).toBe(4);
    expect(top.higher).toBe(3);
    expect(top.median).toBeCloseTo(0.15);
    expect(top.worst).toBeCloseTo(-0.7);
    expect(top.best).toBeCloseTo(0.5);
  });

  it("refuses to call a band statable under the observation floor", () => {
    const thin = baseRates(Array.from({ length: MIN_RATE_OBSERVATIONS - 1 }, (_, i) => obs(9, 0.1, `0x${i}`)));
    expect(band(thin, "5x and up").statable).toBe(false);
    const enough = baseRates(Array.from({ length: MIN_RATE_OBSERVATIONS }, (_, i) => obs(9, 0.1, `0x${i}`)));
    expect(band(enough, "5x and up").statable).toBe(true);
  });

  it("returns the band a given burst falls into", () => {
    const rates = baseRates([obs(1.5, 0.1), obs(9, 0.9, "0xb")]);
    expect(rateFor(rates, 1.7)?.label).toBe("1 to 2x");
    expect(rateFor(rates, 12)?.n).toBe(1);
    expect(rateFor(rates, 2.5)?.n).toBe(0);
  });
});
