import type { BaseRate } from "@/lib/score/baseRates";
import { fmtAge, fmtPct, fmtRatio } from "@/lib/format";
import { MIN_RATE_OBSERVATIONS } from "@/lib/score/constants";

export function Signal({ rate, burst, at, subject }: { rate: BaseRate | null; burst: number; at: string; subject: string }) {
  if (!rate) return null;
  return (
    <p className="signal">
      A Smart Money wallet bought {subject} {fmtAge(at)}, and {fmtRatio(burst)} the token&apos;s normal buyer rate
      showed up in the 10 minutes after.{" "}
      {rate.statable ? (
        <>
          Of the {rate.n} buys Zatto has measured at {rate.label} across {rate.tokens} tokens, {rate.higher} were
          higher 24 hours later. Median {fmtPct(rate.median)}, worst {fmtPct(rate.worst)}.
        </>
      ) : (
        <>
          Zatto has measured {rate.n} {rate.n === 1 ? "buy" : "buys"} at {rate.label}, under the{" "}
          {MIN_RATE_OBSERVATIONS} it takes to call a rate.
        </>
      )}
    </p>
  );
}
