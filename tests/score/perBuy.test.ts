import { describe, it, expect } from "vitest";
import { burstHours, scoreBuy, scoreBurst, hourKey, neededHours } from "@/lib/score/perBuy";
import { buckets, burstRows, closes, crowdedRows, row, LEADER, T0_ISO } from "../fixtures/synthetic/tape";

const buy = { chain: "base", wallet: LEADER, token: "0xtok", tx: "0xtx00xleader", ts: T0_ISO, usd: 100, price: 1.0 };
const std = closes([[0, 1.0], [1, 1.05], [60, 1.2], [1440, 0.9]]);

describe("scoreBuy", () => {
  it("counts prior buyers per hour and excludes them from new buyers", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: std });
    expect(s.baselineRate).toBe(3);
    expect(s.newBuyers).toEqual({ m10: 5, m30: 7, m60: 11 });
  });
  it("excludes the wallet itself and rows outside the windows", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: std });
    expect(s.newBuyers.m60).toBe(11);
  });
  it("fast share counts first buys inside 20 seconds", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: std });
    expect(s.fastShare).toBeCloseTo(3 / 11);
  });
  it("the hour ratio uses the baseline floor of 3", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: std });
    expect(s.crowdRatio).toBeCloseTo(11 / 3);
    const quiet = scoreBuy({ buy, buckets: buckets(crowdedRows.slice(0, 7)), closes: std });
    expect(quiet.crowdRatio).toBeCloseTo(2 / 3);
  });
  it("marks a burst crowded even though the same buy is quiet over the hour", () => {
    const s = scoreBuy({ buy, buckets: buckets(burstRows), closes: std });
    expect(s.newBuyers.m10).toBe(7);
    expect(s.crowdRatio).toBeLessThan(3);
    expect(s.crowdRatio10).toBeCloseTo(7 / 2);
    expect(s.crowded).toBe(true);
  });
  it("crowded is decided on the ten minute burst, not the hour that reverts to baseline", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: std });
    expect(s.crowdRatio10).toBeCloseTo(5 / 2);
    expect(s.crowded).toBe(false);
    const quiet = scoreBuy({ buy, buckets: buckets(crowdedRows.slice(0, 7)), closes: std });
    expect(quiet.crowded).toBe(false);
  });
  it("the ten minute ratio measures the burst against the prior hour rate scaled to ten minutes", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: std });
    expect(s.crowdRatio10).toBeCloseTo(5 / 2);
    expect(s.crowdRatio10).toBeGreaterThan(s.crowdRatio / 2);
  });
  it("returns use the fill price and the first trade at or after 60 s", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: std });
    expect(s.fillPrice).toBe(1.0);
    expect(s.entryPrice).toBe(1.05);
    expect(s.leaderReturn.h1).toBeCloseTo(0.2);
    expect(s.delayedReturn.h24).toBeCloseTo(0.9 / 1.05 - 1);
  });
  it("falls back to the +1 minute close when no trade lands after 60 s", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows.slice(0, 8)), closes: std });
    expect(s.entryPrice).toBe(1.05);
  });
  it("marks immature when a bucket or candle is not final and unusable when capped", () => {
    const im = scoreBuy({ buy, buckets: buckets(crowdedRows, { final: false }), closes: std });
    expect(im.mature).toBe(false); expect(im.usable).toBe(false); expect(im.exclusion).toBe("immature");
    const cap = scoreBuy({ buy, buckets: buckets(crowdedRows, { capped: true, final: false }), closes: std });
    expect(cap.exclusion).toBe("capped");
    const nc = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: closes([[0, 1.0], [1, 1.05], [60, 1.2], [1440, 0.9]], false) });
    expect(nc.mature).toBe(false);
  });
  it("propagates null returns when a close is missing, never zero", () => {
    const s = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: closes([[0, 1.0], [1, 1.05]]) });
    expect(s.leaderReturn.h24).toBeNull();
    expect(s.usable).toBe(false);
    expect(s.exclusion).toBe("no-price");
  });
  it("orders equal timestamps by tape position", () => {
    const rows = [...crowdedRows];
    rows.splice(5, 0, [T0_ISO, "0xsametime", "BUY", 100, 1.01, "0xsame", null]);
    const s = scoreBuy({ buy, buckets: buckets(rows), closes: std });
    expect(s.newBuyers.m10).toBe(6);
  });
  it("hour helpers", () => {
    expect(hourKey("2026-09-10T14:03:11.000Z")).toBe("2026-09-10T14");
    expect(neededHours("2026-09-10T14:03:11.000Z")).toEqual(["2026-09-10T13", "2026-09-10T14", "2026-09-10T15"]);
  });

  it("a trader whose first loaded buy precedes t0 is not new, even outside the baseline window", () => {
    const early = [...crowdedRows, row(-3730, "0xearly"), row(300, "0xearly")];
    const s = scoreBuy({ buy, buckets: buckets(early), closes: std });
    expect(s.baselineRate).toBe(3);
    expect(s.newBuyers).toEqual({ m10: 5, m30: 7, m60: 11 });
    const onlyAfter = [...crowdedRows, row(300, "0xlater")];
    const t = scoreBuy({ buy, buckets: buckets(onlyAfter), closes: std });
    expect(t.newBuyers).toEqual({ m10: 6, m30: 8, m60: 12 });
  });

  it("a buy too young to have a 24 hour candle reads immature, not no-price", () => {
    const young = scoreBuy({ buy, buckets: buckets(crowdedRows, { final: false }), closes: closes([[0, 1.0], [1, 1.05]]) });
    expect(young.exclusion).toBe("immature");
    const stale = scoreBuy({ buy, buckets: buckets(crowdedRows), closes: closes([[0, 1.0], [1, 1.05]]) });
    expect(stale.exclusion).toBe("no-price");
  });
});

describe("scoreBurst", () => {
  const settled = new Date(Date.parse(T0_ISO) + 26 * 60_000);

  it("needs only the hour before and the ten minutes after, not a full hour of tape", () => {
    expect(burstHours(T0_ISO)).toEqual(["2026-09-10T13", "2026-09-10T14"]);
    expect(burstHours("2026-09-10T14:55:00.000Z")).toEqual(["2026-09-10T13", "2026-09-10T14", "2026-09-10T15"]);
  });

  it("scores the burst from the same tape scoreBuy would use and agrees with it", () => {
    const full = scoreBuy({ buy, buckets: buckets(burstRows), closes: std });
    const b = scoreBurst({ buy, buckets: buckets(burstRows), now: settled });
    expect(b.newBuyers10).toBe(full.newBuyers.m10);
    expect(b.baselineRate).toBe(full.baselineRate);
    expect(b.burst).toBeCloseTo(full.crowdRatio10);
    expect(b.crowded).toBe(full.crowded);
    expect(b.fastShare).toBeCloseTo(4 / 7);
  });

  it("settles 25 minutes after the buy, not 24 hours after it", () => {
    const tooSoon = new Date(Date.parse(T0_ISO) + 24 * 60_000);
    expect(scoreBurst({ buy, buckets: buckets(burstRows), now: tooSoon }).settled).toBe(false);
    expect(scoreBurst({ buy, buckets: buckets(burstRows), now: settled }).settled).toBe(true);
  });

  it("never settles on a capped token", () => {
    const b = scoreBurst({ buy, buckets: buckets(burstRows, { capped: true }), now: settled });
    expect(b.capped).toBe(true);
    expect(b.settled).toBe(false);
  });

  it("does not need a price and reports no fast share when nobody followed", () => {
    const alone = [row(-3000, "0xprior1"), row(0, LEADER)];
    const b = scoreBurst({ buy, buckets: buckets(alone), now: settled });
    expect(b.newBuyers10).toBe(0);
    expect(b.burst).toBe(0);
    expect(b.crowded).toBe(false);
    expect(b.fastShare).toBeNull();
  });
});
