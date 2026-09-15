import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { countMissingBuckets } from "@/lib/jobs/scoreWallet";
import { readTape, writeTape } from "@/lib/db/queries";
import type { D1Like } from "@/lib/db/d1";

async function perBucketOracle(db: D1Like, chain: string, buckets: Array<{ token: string; hour: string }>): Promise<number> {
  let n = 0;
  for (const b of buckets) {
    const t = await readTape(db, chain, b.token, b.hour);
    if (!t || !(t.pages_exhausted === 1 && t.matured === 1 && t.capped === 0)) n++;
  }
  return n;
}

function counting(db: D1Like): { db: D1Like; statements: string[] } {
  const statements: string[] = [];
  return { db: { prepare: (sql) => { statements.push(sql); return db.prepare(sql); }, batch: (s) => db.batch(s) }, statements };
}

const HOURS = ["2026-09-10T13", "2026-09-10T14", "2026-09-10T15"];

describe("countMissingBuckets", () => {
  it("counts the same missing buckets as a per-bucket read across every completeness state", async () => {
    const db = openTestDb();
    const states = [
      { token: "0xfinal", pagesExhausted: true, matured: true, capped: false },
      { token: "0xunexhausted", pagesExhausted: false, matured: true, capped: false },
      { token: "0ximmature", pagesExhausted: true, matured: false, capped: false },
      { token: "0xcapped", pagesExhausted: true, matured: true, capped: true },
    ];
    const buckets: Array<{ token: string; hour: string }> = [];
    for (const s of states) {
      for (const hour of HOURS) {
        await writeTape(db, { chain: "base", token: s.token, hour, rows: [], pagesExhausted: s.pagesExhausted, capped: s.capped, matured: s.matured, fetchedAt: "2026-09-10T16:00:00.000Z" });
        buckets.push({ token: s.token, hour });
      }
    }
    for (const hour of HOURS) buckets.push({ token: "0xabsent", hour });
    await writeTape(db, { chain: "other", token: "0xabsent", hour: HOURS[0], rows: [], pagesExhausted: true, capped: false, matured: true, fetchedAt: "2026-09-10T16:00:00.000Z" });

    expect(await countMissingBuckets(db, "base", buckets)).toBe(await perBucketOracle(db, "base", buckets));
    expect(await countMissingBuckets(db, "base", buckets)).toBe(12);
  });

  it("issues one query per 90 tokens rather than one per bucket", async () => {
    const db = openTestDb();
    const buckets: Array<{ token: string; hour: string }> = [];
    for (let i = 0; i < 100; i++) for (const hour of HOURS) buckets.push({ token: `0xt${i}`, hour });
    const c = counting(db);
    expect(await countMissingBuckets(c.db, "base", buckets)).toBe(300);
    expect(c.statements.length).toBe(2);
  });

  it("returns zero without touching the database when there are no buckets", async () => {
    const c = counting(openTestDb());
    expect(await countMissingBuckets(c.db, "base", [])).toBe(0);
    expect(c.statements.length).toBe(0);
  });
});
