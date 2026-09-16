import { MIN_RATE_OBSERVATIONS } from "./constants";
import type { BuyScore } from "./types";

export interface Band { label: string; min: number; max: number }

export const RATE_BANDS: Band[] = [
  { label: "under 1x", min: 0, max: 1 },
  { label: "1 to 2x", min: 1, max: 2 },
  { label: "2 to 3x", min: 2, max: 3 },
  { label: "3 to 5x", min: 3, max: 5 },
  { label: "5x and up", min: 5, max: Infinity },
];

export interface BaseRate {
  label: string;
  min: number;
  max: number;
  n: number;
  tokens: number;
  higher: number;
  median: number | null;
  worst: number | null;
  best: number | null;
  statable: boolean;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function bandFor(burst: number): Band {
  return RATE_BANDS.find((b) => burst >= b.min && burst < b.max) ?? RATE_BANDS[RATE_BANDS.length - 1];
}

export function settledObservations(buys: BuyScore[]): BuyScore[] {
  return buys.filter((b) =>
    b.usable
    && typeof b.crowdRatio10 === "number"
    && Number.isFinite(b.crowdRatio10)
    && b.delayedReturn.h24 != null);
}

export function baseRates(observations: BuyScore[]): BaseRate[] {
  const settled = settledObservations(observations);
  return RATE_BANDS.map((band) => {
    const inBand = settled.filter((b) => b.crowdRatio10 >= band.min && b.crowdRatio10 < band.max);
    const returns = inBand.map((b) => b.delayedReturn.h24 as number);
    return {
      ...band,
      n: inBand.length,
      tokens: new Set(inBand.map((b) => b.token)).size,
      higher: returns.filter((r) => r > 0).length,
      median: median(returns),
      worst: returns.length ? Math.min(...returns) : null,
      best: returns.length ? Math.max(...returns) : null,
      statable: inBand.length >= MIN_RATE_OBSERVATIONS,
    };
  });
}

export function rateFor(rates: BaseRate[], burst: number): BaseRate | null {
  const band = bandFor(burst);
  return rates.find((r) => r.label === band.label) ?? null;
}
