import type { BaseRate } from "@/lib/score/baseRates";
import { fmtAge, fmtPct, fmtRatio } from "@/lib/format";
import { MIN_RATE_OBSERVATIONS } from "@/lib/score/constants";

export function Signal({ rate, burst, at, subject }: { rate: BaseRate | null; burst: number; at: string; subject: string }) {
  if (!rate) return null;
  return (
    <p className="signal">
      {subject} took a Smart Money entry {fmtAge(at)} that drew {fmtRatio(burst)} the token&apos;s prior-hour buyer
      rate in the 10 minutes after.{" "}
      {rate.statable ? (
        <>
          Of the {rate.n} entries Zatto has measured in the {rate.label} band across {rate.tokens} tokens,{" "}
          {rate.higher} were higher 24 hours later. Median {fmtPct(rate.median)}, worst {fmtPct(rate.worst)}.
        </>
      ) : (
        <>
          Zatto has measured {rate.n} {rate.n === 1 ? "entry" : "entries"} in the {rate.label} band, under the{" "}
          {MIN_RATE_OBSERVATIONS} it takes to state a rate.
        </>
      )}
    </p>
  );
}
