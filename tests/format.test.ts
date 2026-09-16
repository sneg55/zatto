import { describe, it, expect } from "vitest";
import { fmtAge, fmtDateTime, fmtGroup, fmtPct, fmtUsd, shortAddr } from "@/lib/format";

describe("format", () => {
  it("formats", () => {
    expect(fmtPct(0.1234)).toBe("+12.3%"); expect(fmtPct(-0.05)).toBe("-5.0%"); expect(fmtPct(null)).toBe("no price");
    expect(fmtGroup({ n: 2, median: null, insufficient: true })).toBe("insufficient (n=2)");
    expect(fmtGroup({ n: 4, median: 0.2, insufficient: false })).toBe("+20.0% (n=4)");
    expect(shortAddr("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });

  it("formats timestamps in UTC regardless of machine timezone", () => {
    expect(fmtDateTime("2026-09-15T17:40:38.320Z")).toBe("15 Sep 2026, 17:40 UTC");
    expect(fmtDateTime("2026-01-03T00:05:00.000Z")).toBe("3 Jan 2026, 00:05 UTC");
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    expect(fmtDateTime("2026-09-15T17:40:38.320Z")).toBe("15 Sep 2026, 17:40 UTC");
    process.env.TZ = originalTz;
  });

  it("falls back to the raw string for an unparseable timestamp", () => {
    expect(fmtDateTime("not-a-date")).toBe("not-a-date");
  });

  it("formats USD amounts", () => {
    expect(fmtUsd(null)).toBe("");
    expect(fmtUsd(0)).toBe("$0");
    expect(fmtUsd(1234.56)).toBe("$1,235");
    expect(fmtUsd(1)).toBe("$1");
    expect(fmtUsd(0.5)).toBe("$0.50");
    expect(fmtUsd(0.009)).toBe("<$0.01");
    expect(fmtUsd(1.2e-7)).toBe("<$0.01");
  });
});

describe("fmtAge", () => {
  const now = Date.parse("2026-09-16T12:00:00.000Z");
  it("reads in hours under two days and in days beyond", () => {
    expect(fmtAge("2026-09-16T10:50:00.000Z", now)).toBe("1h old");
    expect(fmtAge("2026-09-14T13:00:00.000Z", now)).toBe("47h old");
    expect(fmtAge("2026-09-14T11:00:00.000Z", now)).toBe("2d old");
    expect(fmtAge("2026-08-19T12:00:00.000Z", now)).toBe("28d old");
  });
  it("handles the sub-hour and missing cases", () => {
    expect(fmtAge("2026-09-16T11:40:00.000Z", now)).toBe("under 1h old");
    expect(fmtAge(null, now)).toBe("n/a");
  });
});
