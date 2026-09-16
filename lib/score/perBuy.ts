import { BASELINE_FLOOR, BURST_FLOOR, BURST_MINUTES, CROWD_RATIO, DELAYED_ENTRY_SECONDS, FAST_SECONDS, HORIZONS_MINUTES, BURST_SETTLE_MINUTES } from "./constants";
import type { Buy, BurstScore, BuyInput, BuyScore, TapeBucket, TapeRow } from "./types";

export function hourKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 13);
}

export function neededHours(ts: string): string[] {
  const t = new Date(ts).getTime();
  return [-1, 0, 1].map((d) => new Date(t + d * 3_600_000).toISOString().slice(0, 13));
}

function minuteKey(ms: number): string {
  return new Date(ms - (ms % 60_000)).toISOString().slice(0, 16);
}

export function scoreBuy({ buy, buckets, closes }: BuyInput): BuyScore {
  const t0 = new Date(buy.ts).getTime();
  const wallet = buy.wallet.toLowerCase();
  const rows: Array<{ ms: number; trader: string; action: TapeRow[2]; price: number | null; idx: number }> = [];
  let idx = 0;
  for (const b of buckets) for (const r of b.rows) rows.push({ ms: new Date(r[0]).getTime(), trader: r[1].toLowerCase(), action: r[2], price: r[4], idx: idx++ });
  rows.sort((a, b) => a.ms - b.ms || a.idx - b.idx);
  const buys = rows.filter((r) => r.action === "BUY" && r.trader !== wallet);

  const prior = new Set(buys.filter((r) => r.ms >= t0 - 3_600_000 && r.ms < t0).map((r) => r.trader));
  const baselineRate = prior.size;

  const firstBuy = new Map<string, number>();
  for (const r of buys) if (!firstBuy.has(r.trader)) firstBuy.set(r.trader, r.ms);
  const firstAfter = new Map<string, number>();
  for (const [trader, ms] of firstBuy) if (ms >= t0) firstAfter.set(trader, ms);
  const within = (sec: number) => [...firstAfter.values()].filter((ms) => ms < t0 + sec * 1000).length;
  const newBuyers = { m10: within(600), m30: within(1800), m60: within(3600) };
  const fastShare = newBuyers.m60 === 0 ? null : within(FAST_SECONDS) / newBuyers.m60;
  const crowdRatio = newBuyers.m60 / Math.max(baselineRate, BASELINE_FLOOR);
  const burstBaseline = Math.max((baselineRate * BURST_MINUTES) / 60, BURST_FLOOR);
  const crowdRatio10 = within(BURST_MINUTES * 60) / burstBaseline;

  const own = rows.find((r) => r.trader === wallet && r.ms === t0 && r.action === "BUY");
  const closeAt = (ms: number) => closes.get(minuteKey(ms));
  const fillPrice = own?.price ?? buy.price ?? closeAt(t0)?.close ?? null;
  const delayedTrade = rows.find((r) => r.ms >= t0 + DELAYED_ENTRY_SECONDS * 1000 && r.price != null && r.price > 0);
  const entryPrice = delayedTrade?.price ?? closeAt(t0 + 60_000)?.close ?? null;

  const ret = (base: number | null, ms: number) => {
    const c = closeAt(ms);
    return base && c ? c.close / base - 1 : null;
  };
  const leaderReturn = { h1: ret(fillPrice, t0 + HORIZONS_MINUTES.h1 * 60_000), h24: ret(fillPrice, t0 + HORIZONS_MINUTES.h24 * 60_000) };
  const delayedReturn = { h1: ret(entryPrice, t0 + HORIZONS_MINUTES.h1 * 60_000), h24: ret(entryPrice, t0 + HORIZONS_MINUTES.h24 * 60_000) };

  const capped = buckets.some((b) => b.capped);
  const candlesFinal = [t0, t0 + 60_000, t0 + HORIZONS_MINUTES.h1 * 60_000, t0 + HORIZONS_MINUTES.h24 * 60_000].every((ms) => {
    const c = closeAt(ms);
    return c === undefined || c.final;
  });
  const mature = buckets.every((b) => b.final) && candlesFinal;
  const noPrice = entryPrice == null || leaderReturn.h24 == null || delayedReturn.h24 == null;
  const exclusion = capped ? "capped" : !mature ? "immature" : noPrice ? "no-price" : null;

  return { tx: buy.tx, token: buy.token, ts: buy.ts, baselineRate, newBuyers, fastShare, crowdRatio, crowdRatio10, crowded: crowdRatio10 >= CROWD_RATIO, fillPrice, entryPrice, leaderReturn, delayedReturn, mature, usable: exclusion === null, exclusion };
}

export function burstHours(ts: string): string[] {
  const t = new Date(ts).getTime();
  return [...new Set([t - 3_600_000, t, t + BURST_MINUTES * 60_000].map((ms) => new Date(ms).toISOString().slice(0, 13)))];
}

export function burstSettledAt(ts: string): number {
  return new Date(ts).getTime() + BURST_SETTLE_MINUTES * 60_000;
}

export function scoreBurst({ buy, buckets, now }: { buy: Buy; buckets: TapeBucket[]; now: Date }): BurstScore {
  const t0 = new Date(buy.ts).getTime();
  const wallet = buy.wallet.toLowerCase();
  const rows: Array<{ ms: number; trader: string; action: TapeRow[2] }> = [];
  for (const b of buckets) for (const r of b.rows) rows.push({ ms: new Date(r[0]).getTime(), trader: r[1].toLowerCase(), action: r[2] });
  const buys = rows.filter((r) => r.action === "BUY" && r.trader !== wallet);
  const baselineRate = new Set(buys.filter((r) => r.ms >= t0 - 3_600_000 && r.ms < t0).map((r) => r.trader)).size;
  const firstBuy = new Map<string, number>();
  for (const r of buys) if (!firstBuy.has(r.trader) || r.ms < firstBuy.get(r.trader)!) firstBuy.set(r.trader, r.ms);
  const after = [...firstBuy.values()].filter((ms) => ms >= t0);
  const within = (sec: number) => after.filter((ms) => ms < t0 + sec * 1000).length;
  const newBuyers10 = within(BURST_MINUTES * 60);
  const burst = newBuyers10 / Math.max((baselineRate * BURST_MINUTES) / 60, BURST_FLOOR);
  const capped = buckets.some((b) => b.capped);
  return {
    wallet, token: buy.token, tx: buy.tx, ts: buy.ts,
    baselineRate, newBuyers10, burst, crowded: burst >= CROWD_RATIO,
    fastShare: newBuyers10 === 0 ? null : within(FAST_SECONDS) / newBuyers10,
    settled: !capped && now.getTime() >= burstSettledAt(buy.ts),
    capped,
  };
}
