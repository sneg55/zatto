import Link from "next/link";
import type { TokenStat } from "@/lib/score/types";
import { fmtAge, fmtDateTime, fmtRatio, shortAddr } from "@/lib/format";
import { dexscreenerToken, explorerToken, nansenToken } from "@/lib/chains";
import { Delta } from "@/app/_components/Delta";
import { walletHref } from "@/lib/chains";

export function TokenBoard({
  chain,
  runId,
  tokens,
  quiet,
  symbols,
  cluster,
}: {
  chain: string;
  runId?: string;
  tokens: TokenStat[];
  quiet: TokenStat[];
  symbols: Map<string, string>;
  cluster: Record<string, number>;
}) {
  return (
    <>
    <ul className="token-board">
      {tokens.map((t) => (
        <li key={t.token} className={t.verdict === "CROWDED" ? "token-card token-card-crowded" : "token-card"}>
          <div className="token-head">
            <span className="token-name">
              <a href={explorerToken(chain, t.token)} target="_blank" rel="noopener noreferrer" className={symbols.get(t.token) ? undefined : "wallet-addr"}>
                {symbols.get(t.token) ?? shortAddr(t.token)}
              </a>
              <span className="token-links">
                <a href={nansenToken(chain, t.token)} target="_blank" rel="noopener noreferrer">Nansen</a>
                <a href={dexscreenerToken(chain, t.token)} target="_blank" rel="noopener noreferrer">Dexscreener</a>
              </span>
            </span>
            <span className={`tag ${t.verdict === "CROWDED" ? "tag-crowded" : "tag-quiet"}`}>{t.verdict}</span>
          </div>

          <div className="token-stats">
            <span className="token-stat">
              <span className="token-stat-label">Peak buyers vs normal</span>
              <span className="token-stat-value">{fmtRatio(t.maxBurst)}</span>
            </span>
            <span className="token-stat">
              <span className="token-stat-label">Crowded entries</span>
              <span className="token-stat-value">{t.crowded} of {t.buys}</span>
            </span>
            <span className="token-stat">
              <span className="token-stat-label">Wallets</span>
              <span className="token-stat-value">{t.wallets}</span>
            </span>
            <span className="token-stat">
              <span className="token-stat-label">Copy return, 24h</span>
              <span className="token-stat-value"><Delta value={t.medianDelayed24h} /></span>
            </span>
            <span className="token-stat">
              <span className="token-stat-label">Newest buy</span>
              <span className="token-stat-value">{fmtAge(t.newest)}</span>
            </span>
          </div>

          <details className="token-entries">
            <summary>
              Wallets that bought it ({t.wallets} {t.wallets === 1 ? "wallet" : "wallets"}, {t.events}{" "}
              {t.events === 1 ? "entry" : "entries"})
            </summary>
            <div className="table-wrap">
              <table className="data data-cards">
                <thead>
                  <tr>
                    <th>Wallet</th>
                    <th>Entered</th>
                    <th className="num">Buyers vs normal</th>
                    <th className="num">Copy return, 24h</th>
                  </tr>
                </thead>
                <tbody>
                  {t.entries.map((e) => {
                    const peers = cluster[e.wallet];
                    return (
                      <tr key={`${e.wallet}|${e.ts}`}>
                        <td data-label="Wallet" className="lead">
                          <Link href={walletHref(chain, e.wallet, runId)} className="wallet-addr">{shortAddr(e.wallet)}</Link>
                          {peers ? <span className="cell-note">one of {peers} wallets in a cluster</span> : null}
                        </td>
                        <td data-label="Entered">
                          {fmtDateTime(e.ts)}
                          <span className="cell-note">{fmtAge(e.ts)}</span>
                        </td>
                        <td data-label="Buyers vs normal" className="num">
                          {fmtRatio(e.burst)}
                          {e.crowded ? <span className="cell-note">crowded</span> : null}
                        </td>
                        <td data-label="Copy return, 24h" className="num"><Delta value={e.delayed24h} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </li>
      ))}
    </ul>

    {quiet.length ? (
      <details className="quiet-tokens">
        <summary>Tokens where nobody followed: {quiet.length} more</summary>
        <div className="table-wrap">
          <table className="data data-cards">
            <thead>
              <tr>
                <th>Token</th>
                <th className="num">Scored buys</th>
                <th className="num">Wallets</th>
                <th className="num">Buyers vs normal</th>
                <th className="num">Copy return, 24h</th>
                <th className="num">Newest buy</th>
              </tr>
            </thead>
            <tbody>
              {quiet.map((t) => (
                <tr key={t.token}>
                  <td data-label="Token" className="lead">
                    <a href={explorerToken(chain, t.token)} target="_blank" rel="noopener noreferrer" className={symbols.get(t.token) ? undefined : "wallet-addr"}>
                      {symbols.get(t.token) ?? shortAddr(t.token)}
                    </a>
                    <span className="token-links">
                      <a href={nansenToken(chain, t.token)} target="_blank" rel="noopener noreferrer">Nansen</a>
                      <a href={dexscreenerToken(chain, t.token)} target="_blank" rel="noopener noreferrer">Dexscreener</a>
                    </span>
                  </td>
                  <td data-label="Scored buys" className="num">{t.buys}</td>
                  <td data-label="Wallets" className="num">{t.wallets}</td>
                  <td data-label="Buyers vs normal" className="num">{fmtRatio(t.medianBurst)}</td>
                  <td data-label="Copy return, 24h" className="num"><Delta value={t.medianDelayed24h} /></td>
                  <td data-label="Newest buy" className="num">{fmtAge(t.newest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    ) : null}
    </>
  );
}
