import type { D1Like } from "../db/d1";
import { readTape, releaseTapeLock, takeTapeLock, writeTape, type TapeRowRecord } from "../db/queries";
import { MATURITY_MINUTES, TAPE_BYTES_CAP, TAPE_PAGE_CAP } from "../score/constants";
import type { TapeBucket, TapeRow } from "../score/types";
import type { NansenClient } from "./client";
import { fetchTapePage, type TgmTrade } from "./endpoints";

const REFETCH_MS = { score: 10 * 60_000, recent: 60_000 } as const;

function toRow(t: TgmTrade): TapeRow {
  return [new Date(t.block_timestamp).toISOString(), t.trader_address.toLowerCase(), t.action, t.estimated_value_usd, t.estimated_swap_price_usd, t.transaction_hash, t.trader_address_label];
}

function hourEndMs(hour: string): number { return new Date(`${hour}:00:00.000Z`).getTime() + 3_600_000; }

export function isMatured(hour: string, at: Date): boolean {
  return at.getTime() >= hourEndMs(hour) + MATURITY_MINUTES * 60_000;
}

function refetchSlot(hour: string, iso: string, intervalMs: number): number {
  const hourStart = new Date(`${hour}:00:00.000Z`).getTime();
  return Math.floor((new Date(iso).getTime() - hourStart) / intervalMs);
}

function bucketFrom(row: { rows: string; pages_exhausted: number; matured: number; capped: number }): { rows: TapeRow[]; final: boolean; capped: boolean } {
  return { rows: JSON.parse(row.rows) as TapeRow[], final: row.pages_exhausted === 1 && row.matured === 1 && row.capped === 0, capped: row.capped === 1 };
}

function decideFromStored(hour: string, stored: TapeRowRecord, now: Date, purpose: "score" | "recent"): TapeBucket | null {
  const final = stored.pages_exhausted === 1 && stored.matured === 1 && stored.capped === 0;
  const stale = refetchSlot(hour, now.toISOString(), REFETCH_MS[purpose]) > refetchSlot(hour, stored.fetched_at, REFETCH_MS[purpose]);
  const needsMaturityRefetch = stored.matured === 0 && isMatured(hour, now);
  if (final || stored.capped === 1 || (!needsMaturityRefetch && !stale)) {
    return { hour, rows: JSON.parse(stored.rows) as TapeRow[], final, capped: stored.capped === 1 };
  }
  return null;
}

async function fetchAndStore(db: D1Like, client: NansenClient, chain: string, token: string, hour: string, now: Date): Promise<TapeBucket> {
  const rows: TapeRow[] = [];
  let exhausted = false, capped = false;
  for (let page = 1; page <= TAPE_PAGE_CAP; page++) {
    const r = await fetchTapePage(client, chain, token, hour, page);
    for (const t of r.rows) rows.push(toRow(t));
    if (r.isLast) { exhausted = true; break; }
    if (page === TAPE_PAGE_CAP) capped = true;
  }
  if (JSON.stringify(rows).length > TAPE_BYTES_CAP) capped = true;
  const matured = isMatured(hour, now);
  await writeTape(db, { chain, token, hour, rows, pagesExhausted: exhausted, capped, matured, fetchedAt: now.toISOString() });
  return { hour, rows, final: exhausted && matured && !capped, capped };
}

export async function getTape(db: D1Like, client: NansenClient, chain: string, token: string, hour: string, now: Date, purpose: "score" | "recent", sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<TapeBucket> {
  const stored = await readTape(db, chain, token, hour);
  if (stored) {
    const decided = decideFromStored(hour, stored, now, purpose);
    if (decided) return decided;
  }
  const leaseUntil = new Date(now.getTime() + 30_000).toISOString();
  let got = await takeTapeLock(db, chain, token, hour, now.toISOString(), leaseUntil);
  if (!got) {
    for (let i = 0; i < 10 && !got; i++) {
      await sleep(1000);
      got = await takeTapeLock(db, chain, token, hour, now.toISOString(), leaseUntil);
      if (!got) {
        const again = await readTape(db, chain, token, hour);
        if (again && (!stored || again.fetched_at > stored.fetched_at)) {
          return { hour, ...bucketFrom(again) };
        }
      }
    }
    if (!got) return { hour, rows: stored ? (JSON.parse(stored.rows) as TapeRow[]) : [], final: false, capped: false };
  }
  try {
    const fresh = await readTape(db, chain, token, hour);
    if (fresh) {
      const decided = decideFromStored(hour, fresh, now, purpose);
      if (decided) return decided;
    }
    return await fetchAndStore(db, client, chain, token, hour, now);
  } finally {
    await releaseTapeLock(db, chain, token, hour);
  }
}
