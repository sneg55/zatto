import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { readTokenScan } from "@/lib/db/queries";
import { fmtDateTime, fmtSpan, shortAddr } from "@/lib/format";
import { dexscreenerToken, explorerToken, isAddress, isSupportedChain, nansenToken } from "@/lib/chains";
import { CROWD_RATIO, TOKEN_SCAN_DAYS, TOKEN_SCAN_ENTRIES } from "@/lib/score/constants";
import type { TokenScan } from "@/lib/liveToken";
import { baseRates, rateFor } from "@/lib/score/baseRates";
import { readAllScoredBuys } from "@/lib/db/queries";
import { Signal } from "@/app/_components/Signal";
import { TokenBoard } from "@/app/_components/TokenBoard";
import { Forming } from "@/app/_components/Forming";
import { ScanButton } from "./ScanButton";

export const dynamic = "force-dynamic";

export default async function TokenPage({ params }: { params: Promise<{ chain: string; addr: string }> }) {
  const { chain, addr } = await params;
  if (!isSupportedChain(chain) || !isAddress(addr)) notFound();
  const token = addr.toLowerCase();
  const db = getDb();
  const snap = await readTokenScan(db, chain, token);
  const scan = snap ? (JSON.parse(snap.result) as TokenScan) : null;
  const name = scan?.symbol ?? shortAddr(token);
  const symbols = new Map(scan?.symbol ? [[token, scan.symbol]] : []);
  const crowded = scan ? scan.forming.filter((f) => f.crowded).length + (scan.stat?.crowded ?? 0) : 0;
  const hardest = scan
    ? [
        ...scan.forming.map((f) => ({ burst: f.burst, ts: f.ts })),
        ...(scan.stat?.entries ?? []).map((e) => ({ burst: e.burst, ts: e.ts })),
      ].sort((a, b) => b.burst - a.burst)[0] ?? null
    : null;
  const rates = scan ? baseRates(await readAllScoredBuys(db, chain)) : [];
  const settled = scan?.stat?.buys ?? 0;

  return (
    <main>
      <div className="page-head">
        <p className="eyebrow">{chain} token</p>
        <h1>{name}</h1>
        <p className="link-row" style={{ margin: "16px 0 0" }}>
          <a href={explorerToken(chain, token)} target="_blank" rel="noopener noreferrer">Basescan</a>
          <span className="divider-dot">&middot;</span>
          <a href={nansenToken(chain, token)} target="_blank" rel="noopener noreferrer">Nansen</a>
          <span className="divider-dot">&middot;</span>
          <a href={dexscreenerToken(chain, token)} target="_blank" rel="noopener noreferrer">Dexscreener</a>
          <span className="divider-dot">&middot;</span>
          <Link href={`/scan/${chain}`}>Back to the leaderboard</Link>
        </p>
      </div>

      {scan ? (
        <>
          <div className="meta-block">
            <div className="meta-item">
              <span className="meta-label">Smart Money buys</span>
              <span className="meta-value">{scan.smartMoneyBuys}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Distinct entries</span>
              <span className="meta-value">{scan.entries}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Wallets</span>
              <span className="meta-value">{scan.wallets.length}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Reaches back</span>
              <span className="meta-value">{fmtSpan(scan.window?.from ?? null, scan.window?.to ?? null)}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Drew a crowd</span>
              <span className="meta-value">{crowded} of {scan.entries}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Scanned</span>
              <span className="meta-value muted">{fmtDateTime(snap!.computedAt)}</span>
            </div>
          </div>

          {hardest ? (
            <section className="signal-band">
              <Signal rate={rateFor(rates, hardest.burst)} burst={hardest.burst} at={hardest.ts} subject={name} />
            </section>
          ) : null}

          <p className="page-verdict">
            Smart Money bought {name} {scan.smartMoneyBuys}{" "}
            {scan.smartMoneyBuys === 1 ? "time" : "times"} over the{" "}
            {fmtSpan(scan.window?.from ?? null, scan.window?.to ?? null)} this scan reaches back, from{" "}
            {scan.wallets.length} {scan.wallets.length === 1 ? "wallet" : "wallets"}. Repeated swaps by one wallet
            inside an hour count once, which leaves {scan.entries}{" "}
            {scan.entries === 1 ? "entry" : "entries"}, and {crowded} of them drew at least {CROWD_RATIO} times the
            token&apos;s prior-hour buyer rate in the 10 minutes after.
          </p>

          <p className="foot-note" style={{ marginTop: 12 }}>
            {settled
              ? `${settled} of those entries are old enough to carry a settled 24 hour return.`
              : "None of those entries is old enough yet to carry a settled 24 hour return."}
            {scan.truncated
              ? ` This reads the newest ${TOKEN_SCAN_ENTRIES} entries rather than the whole ${TOKEN_SCAN_DAYS} day window, because the token had more than that.`
              : ` That is every Smart Money entry in the ${TOKEN_SCAN_DAYS} day window.`}
          </p>

          {scan.forming.length ? (
            <Forming
              chain={chain}
              rows={scan.forming}
              symbols={symbols}
              subject={`Smart Money buys in ${name}`}
              title="Entries too recent to carry a return"
            />
          ) : null}

          {scan.stat && scan.stat.buys ? (
            <section className="section">
              <h2 className="display-sub">What followed each entry</h2>
              <p className="foot-note" style={{ marginTop: 0 }}>
                Every Smart Money entry old enough for its 24 hour return to settle, with the burst it drew. The
                token is CROWDED when at least one of them cleared {CROWD_RATIO}x the prior-hour buyer rate.
              </p>
              <TokenBoard chain={chain} tokens={[scan.stat]} quiet={[]} symbols={symbols} cluster={{}} />
            </section>
          ) : (
            <p className="foot-note">
              No Smart Money entry in this token is old enough for a settled 24 hour return yet.
            </p>
          )}

          <ScanButton chain={chain} token={token} label="Scan it again" />
          <p className="foot-note">
            A scan reads every Smart Money buy in the token over {TOKEN_SCAN_DAYS} days, then the tape around each
            entry. Results are cached for an hour.
          </p>
        </>
      ) : (
        <div className="empty-state">
          <p className="eyebrow">Not scanned yet</p>
          <h1>{shortAddr(token)}</h1>
          <p>
            Zatto has no scan of this token. A scan reads every Smart Money buy in it over the last{" "}
            {TOKEN_SCAN_DAYS} days and measures the burst of new buyers that followed each one.
          </p>
          <ScanButton chain={chain} token={token} label="Scan this token" />
        </div>
      )}
    </main>
  );
}
