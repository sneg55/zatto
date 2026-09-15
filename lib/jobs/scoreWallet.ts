import type { D1Like } from "../db/d1";
import { readTape } from "../db/queries";
import type { NansenClient } from "../nansen/client";
import { getCloses } from "../nansen/candles";
import { getTape } from "../nansen/tape";
import { HORIZONS_MINUTES } from "../score/constants";
import { neededHours, scoreBuy } from "../score/perBuy";
import { scoreWallet } from "../score/perWallet";
import type { Buy, BuyScore, TapeBucket, WalletScore } from "../score/types";

export function minutesNeeded(ts: string): string[] {
  const t = new Date(ts).getTime();
  const key = (ms: number) => new Date(ms - (ms % 60_000)).toISOString().slice(0, 16);
  return [key(t), key(t + 60_000), key(t + HORIZONS_MINUTES.h1 * 60_000), key(t + HORIZONS_MINUTES.h24 * 60_000)];
}

export function bucketsFor(buys: Buy[]): Array<{ token: string; hour: string }> {
  const seen = new Set<string>();
  const out: Array<{ token: string; hour: string }> = [];
  for (const b of buys) {
    for (const hour of neededHours(b.ts)) {
      const k = `${b.token}|${hour}`;
      if (!seen.has(k)) { seen.add(k); out.push({ token: b.token, hour }); }
    }
  }
  return out;
}

export async function countMissingBuckets(db: D1Like, chain: string, buckets: Array<{ token: string; hour: string }>): Promise<number> {
  let n = 0;
  for (const b of buckets) {
    const t = await readTape(db, chain, b.token, b.hour);
    if (!t || !(t.pages_exhausted === 1 && t.matured === 1 && t.capped === 0)) n++;
  }
  return n;
}

export async function scoreBuysWithData(db: D1Like, client: NansenClient, chain: string, buys: Buy[], now: Date, stop: () => boolean): Promise<{ scored: BuyScore[]; skipped: number }> {
  const scored: BuyScore[] = [];
  let skipped = 0;
  for (const buy of buys) {
    if (stop()) { skipped++; continue; }
    const buckets: TapeBucket[] = [];
    for (const hour of neededHours(buy.ts)) buckets.push(await getTape(db, client, chain, buy.token, hour, now, "score"));
    const closes = await getCloses(db, client, chain, buy.token, minutesNeeded(buy.ts), now);
    scored.push(scoreBuy({ buy, buckets, closes }));
  }
  return { scored, skipped };
}

export async function scoreOneWallet(db: D1Like, client: NansenClient, chain: string, wallet: string, buys: Buy[], now: Date, requestCap: number): Promise<{ score: WalletScore; partial: number }> {
  const start = client.requests;
  const { scored, skipped } = await scoreBuysWithData(db, client, chain, buys, now, () => client.requests - start >= requestCap);
  return { score: scoreWallet(chain, wallet, scored), partial: skipped };
}
