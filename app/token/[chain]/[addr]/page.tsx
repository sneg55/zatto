import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { readTokenScan } from "@/lib/db/queries";
import { fmtDateTime, shortAddr } from "@/lib/format";
import { dexscreenerToken, explorerToken, isAddress, isSupportedChain, nansenToken } from "@/lib/chains";
import { CROWD_RATIO, TOKEN_SCAN_DAYS, TOKEN_SCAN_ENTRIES } from "@/lib/score/constants";
import type { TokenScan } from "@/lib/liveToken";
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
              <span className="meta-label">Window</span>
              <span className="meta-value">{scan.truncated ? `newest ${scan.entries} entries` : `${scan.days} days`}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Scanned</span>
              <span className="meta-value muted">{fmtDateTime(snap!.computedAt)}</span>
            </div>
          </div>

          {scan.truncated ? (
            <p className="foot-note" style={{ marginTop: -16 }}>
              The token returned a full page of Smart Money buys, so this reads the newest{" "}
              {TOKEN_SCAN_ENTRIES} distinct entries rather than the whole {TOKEN_SCAN_DAYS} days. Repeated swaps by
              one wallet inside an hour count as one entry.
            </p>
          ) : null}

          {scan.forming.length ? (
            <Forming
              chain={chain}
              rows={scan.forming}
              symbols={symbols}
              subject={`Smart Money buys in ${name}`}
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
