# Zatto

Point it at a Smart Money wallet and it tells you how many new buyers show up after it buys, how fast, and what buying after it would have returned.

Built for the Nansen Meridian Buildathon (Sep 14-27, 2026). Powered by Nansen API.

## What Zatto measures

For a wallet, Zatto reports new buyers after each of its buys against the token's prior rate, how fast they arrive, and what a delayed entry after the wallet would have returned, ending in a crowd verdict. For a chain it ranks Smart Money wallets by crowding. For one wallet it shows a provisional panel of the buyers arriving after its newest buy.

Zatto claims three things, and only these:

- Counts of distinct new buyer addresses of the same token in fixed windows after the wallet's buy, against the token's own prior-hour rate.
- The share of those arrivals inside 20 seconds ("fast arrivals").
- The token's price return from the wallet's fill and from a delayed entry, at fixed horizons.

Zatto does not claim any address copied the wallet, and it does not predict.

## Verdicts

Each wallet gets a crowd class and a return note:

- `THIN`: fewer than 5 usable buys in the lookback window. Not enough data for a verdict.
- `CROWDED`: more than half of usable buys drew a crowd (`crowdRatio >= 3`, see Method).
- `QUIET`: usable buys exist but a crowd formed on half or fewer of them.

Alongside the crowd class, when both the crowded and the uncrowded group have at least 3 mature buys, the wallet page states the delayed-entry 24h return for each group side by side, for example "delayed entry after crowded buys returned +4.2% vs +11.7% after quiet buys". Otherwise it says there is not enough data in one group to compare.

## Quick start

```
git clone https://github.com/sneg55/zatto.git
cd zatto
npm i
npx wrangler login
npx wrangler d1 create zatto
```

Paste the database id the last command prints into `wrangler.jsonc`, replacing `REPLACE_AFTER_wrangler_d1_create`.

```
npm run cf-typegen
npm run migrate:remote
npx wrangler secret put NANSEN_API_KEY
npx wrangler secret put X402_PAY_TO
npx wrangler secret put INTERNAL_SECRET
npx wrangler secret put FACILITATOR_URL
npm run deploy
```

`wrangler secret put` sets the key the deployed Worker uses. `scripts/proof.ts` runs locally and reads its own copy from `.dev.vars`, so copy `.dev.vars.example` to `.dev.vars` and fill in a real `NANSEN_API_KEY` before the next step.

```
npm run proof
npm run seed:fixtures
```

`npm run proof` is a live check against the real API. It prints its own request count and writes its raw responses to `tests/fixtures/real/`, including `wallet-score.json`. `npm run seed:fixtures` is optional: once that file exists, it loads it into D1 as one completed run so the leaderboard and one wallet page render without waiting for the first cron run. The repo does not ship with a fixture snapshot; only `tests/fixtures/real/.gitkeep` is checked in. Run `proof` first, or `seed:fixtures` has nothing to load and exits with an error saying so.

### Troubleshooting

`opennextjs-cloudflare build` (used by `npm run preview` and `npm run deploy`) cleans out `.open-next/` itself. Running a plain `npm run build` right after a `preview` without that cleanup leaves a stale `.open-next/` directory behind, and the `@ts-expect-error` in `worker/index.ts` then reports TS2578 because the stale build no longer matches the source it is suppressing. `rm -rf .open-next` before a plain `npm run build` fixes it.

## Local with fixtures

```
ZATTO_LOCAL=1 npm run migrate:local
```

Once `npm run proof` has produced `tests/fixtures/real/wallet-score.json` (see Quick start, that step needs a real `NANSEN_API_KEY`), seed the local database from it and run the app with no further Nansen calls:

```
ZATTO_LOCAL=1 npm run seed:fixtures
npm run dev
```

## Paid scans

`POST /api/scan/base` is an x402 seller. It returns 402 until paid, then 202 with a `run_id` once the payment settles. Price is 5 USDC on Base (`eip155:8453`), paid to `X402_PAY_TO`, settled through a single facilitator (PayAI).

Pay it with a funded Base private key:

```
PAYER_KEY=0x... npm run pay -- https://<your-host>/api/scan/base
```

`scripts/pay.ts` is a small, public script on `@x402/fetch` and `@x402/evm`. It signs the payment with `PAYER_KEY` and retries the request. No dependency on private code.

A settled job that later fails (step limit, a Nansen error, budget exhaustion) is shown on its scan page as failed, with the reason and the settlement transaction. Failed paid runs are refunded manually by the operator on request, with that transaction as the reference. Nothing about a refund is automatic.

## Method

Constants live in `lib/score/constants.ts`. They are choices made for this build, not measurements of anything:

| Constant | Value | Meaning |
|---|---|---|
| `CROWD_RATIO` | 3 | New buyers in 60 minutes at or above 3x the baseline rate counts as a crowd |
| `BASELINE_FLOOR` | 3 | The baseline rate used in that ratio is never treated as lower than 3 per hour, so a baseline of 0 or 1 does not turn a handful of buyers into a crowd |
| `FAST_SECONDS` | 20 | Window for a "fast arrival" |
| `DELAYED_ENTRY_SECONDS` | 60 | A delayed entry is priced at the first trade at or after this many seconds past the wallet's buy |
| `MIN_USABLE_BUYS` | 5 | Below this many usable buys, the wallet's verdict is `THIN` |
| `MIN_GROUP` | 3 | Below this many mature buys in the crowded or the uncrowded group, that group's median return is `insufficient` rather than stated |
| `LOOKBACK_DAYS` | 30 | How far back qualifying buys are pulled for a wallet |
| `MAX_BUYS_PER_WALLET` | 10 | The most recent qualifying buys kept per wallet |
| `TOP_WALLETS` | 10 | How many Smart Money wallets a scan run scores, ranked by buy count on the discovered tokens |
| `MATURITY_MINUTES` | 15 | How long after an hour bucket or a candle minute Zatto waits before treating it as final, to allow for late-indexed trades |

What the code does today: an hour bucket is fetched from `tgm/dex-trades` up to 3 pages of 1,000 rows; a bucket that still needs a 4th page, or whose stored rows exceed 1,500,000 bytes, is marked capped and every buy that needs it becomes unusable. A `tgm/token-ohlcv` minute with no matching candle in the response is recorded as a `candle_gap` row (`missing`, `truncated`, or `pending`) rather than treated as a zero return. This section has not been filled in with measured request counts or row counts from a real run. No `NANSEN_API_KEY` has been available to run `scripts/proof.ts` against the live API yet; those numbers replace this paragraph once a real proof run has happened.

## Endpoints used

Zatto reads four Nansen endpoints, all redistribution-allowed with attribution: `token-screener`, `tgm/dex-trades`, `profiler/dex-trades`, and `tgm/token-ohlcv`. Every page in the app shows "Powered by Nansen API".

## Prior work

[github.com/sneg55/anthroalert](https://github.com/sneg55/anthroalert) is a March 2026 Nansen CLI challenge entry. It is unrelated code; nothing from it is reused here.

## License

MIT, see `LICENSE`.
