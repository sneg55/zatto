import { describe, it, expect } from "vitest";
import { distinctEvents } from "@/lib/score/events";
import type { Buy } from "@/lib/score/types";

const buy = (token: string, ts: string, tx = ts): Buy => ({ chain: "base", wallet: "0xw", token, tx, ts, usd: 10, price: 1 });

describe("distinctEvents", () => {
  it("collapses one split swap into a single event and keeps the earliest fill", () => {
    const split = [
      buy("0xa", "2026-08-30T12:53:40.000Z"),
      buy("0xa", "2026-08-30T12:52:10.000Z"),
      buy("0xa", "2026-08-30T12:51:02.000Z"),
    ];
    const events = distinctEvents(split, 8);
    expect(events.length).toBe(1);
    expect(events[0].ts).toBe("2026-08-30T12:51:02.000Z");
  });

  it("keeps entries into the same token in different hours apart", () => {
    const events = distinctEvents([buy("0xa", "2026-09-13T16:02:00.000Z"), buy("0xa", "2026-09-13T11:53:00.000Z")], 8);
    expect(events.length).toBe(2);
  });

  it("returns the newest events first and honours the cap", () => {
    const rows = Array.from({ length: 20 }, (_, i) => buy("0xt" + i, `2026-09-${String(10 + (i % 4))}T0${i % 9}:00:00.000Z`));
    const events = distinctEvents(rows, 8);
    expect(events.length).toBe(8);
    expect(events.map((e) => e.ts)).toEqual([...events.map((e) => e.ts)].sort().reverse());
  });
});
