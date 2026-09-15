import { describe, it, expect } from "vitest";
import { fmtGroup, fmtPct, shortAddr } from "@/lib/format";

describe("format", () => {
  it("formats", () => {
    expect(fmtPct(0.1234)).toBe("+12.3%"); expect(fmtPct(-0.05)).toBe("-5.0%"); expect(fmtPct(null)).toBe("no price");
    expect(fmtGroup({ n: 2, median: null, insufficient: true })).toBe("insufficient (n=2)");
    expect(fmtGroup({ n: 4, median: 0.2, insufficient: false })).toBe("+20.0% (n=4)");
    expect(shortAddr("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });
});
