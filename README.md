# Zatto

Point it at a Smart Money wallet and it tells you how many new buyers show up after it buys, how fast, and what buying after it would have returned.

Built for the Nansen Meridian Buildathon (Sep 14-27, 2026). Powered by Nansen API.

## What Zatto measures

For a chain, Zatto ranks the tokens Smart Money bought by how hard a burst of new buyers followed, with the wallets that triggered each burst nested under it, and the wallet leaderboard below as supporting detail. For a wallet it reports new buyers after each of its buys against the token's prior rate, how fast they arrive, and what a delayed entry after the wallet would have returned. For one wallet it shows a provisional panel of the buyers arriving after its newest buy.

Zatto claims three things, and only these:

- Counts of distinct new buyer addresses of the same token in fixed windows after the wallet's buy, against the token's own prior-hour rate.
- The share of those arrivals inside 20 seconds ("fast arrivals").
- The token's price return from the wallet's fill and from a delayed entry, at fixed horizons.

Zatto does not claim any address copied the wallet, and it does not predict.

## Verdicts

A token gets a crowd class from its own entries:

- `CROWDED`: at least one scored entry drew a crowd (`crowdRatio10 >= 3`, see Method). Crowding is an event, so one measured entry settles it.
- `QUIET`: scored entries exist and none of them drew a crowd.

A wallet gets a crowd class and a return note under a stricter rule, because a wallet is a habit rather than an event:

- `THIN`: fewer than 4 scored buys in the lookback window. Not enough data for a verdict.
- `CROWDED`: more than half of scored buys drew a crowd.
- `QUIET`: scored buys exist but a crowd formed on half or fewer of them.

On the runs measured so far no wallet has been `CROWDED`, because crowding concentrates in a handful of tokens rather than spreading across any one wallet's whole book. The board leads with tokens for that reason.

Repeated swaps by one wallet into one token inside the same hour are one buy, not several. The profiler returns each fill of a split swap as its own trade, and counting them separately makes a median over copies of a single entry.

The delayed-entry return comparison is stated across the whole run rather than per wallet, because eight buys per wallet rarely fill both groups at `MIN_GROUP`. The scan page states the crowded and quiet medians side by side with the number of buys behind each and the number of distinct token minutes and tokens they came from, so a single entry replicated across an address cluster cannot read as many observations.

## Quick start

```
git clone https://github.com/sneg55/zatto.git
cd zatto
npm i
npx wrangler login
npx wrangler d1 create zatto
```

Paste the database id the last command prints into `wrangler.jsonc`, replacing `REPLACE_AFTER_wrangler_d1_create`.

In the same file, replace the `PUBLIC_BASE_URL` var, which ships as `https://zatto.REPLACE.workers.dev`, with the URL the Worker will be deployed to. It is the host the scan step trigger calls and the host in the scan URL a payer gets back, so every request fails with a message pointing here until it is set.

```
npm run cf-typegen
npm run migrate:remote
npx wrangler secret put NANSEN_API_KEY
npx wrangler secret put X402_PAY_TO
npx wrangler secret put INTERNAL_SECRET
npx wrangler secret put FACILITATOR_URL
npm run deploy
```

`wrangler secret put` sets the key the deployed Worker uses. `INTERNAL_SECRET` is yours to invent and is never shown to anyone: `openssl rand -hex 32` prints a usable one to paste at the prompt. `scripts/proof.ts` runs locally and reads its own copy from `.dev.vars`, so copy `.dev.vars.example` to `.dev.vars` and fill in a real `NANSEN_API_KEY` before the next step.

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

`POST /api/scan/base` is an x402 seller. It returns 402 until paid, then 202 with a `run_id` once the payment settles. Price is 1 USDC on Base (`eip155:8453`), paid to `X402_PAY_TO`, settled through a single facilitator (PayAI).

Pay it with a funded Base private key:

```
PAYER_KEY=0x... npm run pay -- https://<your-host>/api/scan/base
```

The scan page pays from a browser wallet. It reads the terms out of the 402, asks the wallet to sign the EIP-3009 transfer authorisation (a signature, not a transaction, so it costs no gas), retries the request with the payment, and opens the run the moment settlement returns. A terminal path stays available behind a disclosure on the same panel.

The 402 advertises the asset's EIP-712 domain in `extra`, which Base USDC reports on chain as `name` "USD Coin" and `version` "2". Without it a client cannot build a payload at all, and the endpoint answers every payment attempt with a domain error.

`scripts/pay.ts` is a small, public script on `@x402/fetch` and `@x402/evm`. It signs the payment with `PAYER_KEY` and retries the request. No dependency on private code.

A settled job that later fails (step limit, a Nansen error, budget exhaustion) is shown on its scan page as failed, with the reason and the settlement transaction. Failed paid runs are refunded manually by the operator on request, with that transaction as the reference. Nothing about a refund is automatic.

### If a paid scan does not run

A job can reach one of two states where the payment may have settled but the app never recorded the outcome:

- Status `settling`: the app claimed the job and called the facilitator but crashed or timed out before storing the result. The scan page shows it as not started, retrying the same payment returns 202 with the same run id pointing at a scan page that never progresses, and `/api/health` lists it under `settling` jobs.
- Status `failed` with the error "settlement facilitator unreachable": the facilitator call threw after the payment may have already been submitted. Retrying returns 402.

In both cases, the resolution is manual. Check the payment nonce against the facilitator or on chain. If it settled, the operator refunds or reruns the scan by hand. Neither state auto-recovers because failing a `settling` job on a timer could mislabel a successful settlement as failed. The scan page for a run shows its status and any error, and `/api/health` lists jobs by status.

## Method

Constants live in `lib/score/constants.ts`. They are choices made for this build, not measurements of anything:

| Constant | Value | Meaning |
|---|---|---|
| `CROWD_RATIO` | 3 | New buyers in the burst window at or above 3x the token's prior-hour rate, scaled to that window, counts as a crowd |
| `BASELINE_FLOOR` | 3 | The hourly baseline is never treated as lower than 3 per hour, so a baseline of 0 or 1 does not turn a handful of buyers into a crowd |
| `BURST_MINUTES` | 10 | The window the crowd verdict is decided on. New buyers over a full hour revert to the token's own rate by construction: across 34 scored buys on Base the 60 minute ratio never reached 3x, while the 10 minute ratio ran a median of 1.04x, 3.15x at the 90th percentile and 17.57x at the top |
| `BURST_FLOOR` | 2 | The prior-hour rate scaled to the burst window is never treated as lower than 2 buyers |
| `FAST_SECONDS` | 20 | Window for a "fast arrival" |
| `DELAYED_ENTRY_SECONDS` | 60 | A delayed entry is priced at the first trade at or after this many seconds past the wallet's buy |
| `MIN_USABLE_BUYS` | 4 | Below this many scored buys, the wallet's verdict is `THIN` |
| `MIN_GROUP` | 3 | Below this many mature buys in the crowded or the uncrowded group, that group's median return is `insufficient` rather than stated |
| `LOOKBACK_DAYS` | 30 | How far back qualifying buys are pulled for a wallet |
| `MAX_BUYS_PER_WALLET` | 8 | The most recent qualifying buys kept per wallet, after collapsing repeated swaps into one token in one hour |
| `TOP_WALLETS` | 10 | How many Smart Money wallets a scan run scores, ranked by buy count on the discovered tokens |
| `DISCOVERY_TOKENS` | 12 | How many tokens a scan sweeps for Smart Money buyers, interleaved from two screener calls: one filtered to tokens under `FRESH_TOKEN_MAX_AGE_DAYS`, one unfiltered. Discovery draws on its own budget, so it cannot starve the wallet fetch |
| `FRESH_TOKEN_MAX_AGE_DAYS` | 14 | The age bound on the fresh half of discovery. Sorting the screener by volume alone returns tokens already doing tens to hundreds of buyers an hour, where nothing can look like a burst |
| `MATURITY_MINUTES` | 15 | How long after an hour bucket or a candle minute Zatto waits before treating it as final, to allow for late-indexed trades |
| `SCORABLE_AGE_MINUTES` | 2880 | How old a buy must be before it is used for scoring. The profiler endpoint does not honor a `date.to` bound inside roughly the last day, so the cutoff has to clear that window, not just the 24 hour return horizon plus maturity |
| `FORMING_WINDOW_HOURS` | 48 | How far back the forming pass looks for buys too recent to score. Beyond it a buy is old enough to carry a return and belongs on the scored board instead |
| `FORMING_BUYS` | 15 | How many of the newest such buys the pass scores |
| `FORMING_REQUESTS` | 24 | The pass's own request budget, separate from the step's, so a forming pass cannot consume the requests a scored run still needs |
| `FORMING_SECONDS` | 25 | The pass's own time budget, for the same reason. Without one an early version outlived the step lease and left a fully scored run unpublished |
| `CARRY_FORWARD_MAX_MINUTES` | 60 | `tgm/token-ohlcv` only returns a candle for a minute that actually had a trade, so a target minute with no candle of its own resolves to the close of the nearest earlier candle, as long as that candle is within this many minutes. Beyond it the price is too stale to use and the minute is recorded `missing` instead |

What the code does today: an hour bucket is fetched from `tgm/dex-trades` up to 3 pages of 1,000 rows; a bucket that still needs a 4th page, or whose stored rows exceed 1,500,000 bytes, is marked capped and every buy that needs it becomes unusable. A `tgm/token-ohlcv` minute with no candle at that exact minute is resolved to the nearest earlier candle within `CARRY_FORWARD_MAX_MINUTES`; past that bound, or with no earlier candle at all, it is recorded as a `candle_gap` row (`missing`, `truncated`, or `pending`) rather than treated as a zero return.

Measured on run `manual-base-6` against the live API on 2026-09-15, published at `/scan/base/manual-base-6`: 30 wallets discovered across 24 screener tokens and scored for 458 requests, giving 162 scored buys over 120 distinct token minutes on 42 tokens.

The burst ratio ran a median of 1.02x, 2.64x at the 75th percentile, 17.00x at the 90th and 38.50x at the top. Across the five bands the run put 74 buys under 1x, 37 between 1 and 2x, 18 between 2 and 3x, 12 between 3 and 5x and 21 at 5x or more, so 33 of 162 cleared the 3x threshold. Entering one minute after those crowded buys returned a median +39.8% at 24 hours, against -1.7% after the 129 quiet ones.

The crowding is concentrated rather than spread: 10 of the 42 tokens account for every crowded buy. LOTTO carried 17 of them over 35 scored buys and returned a median +106.6%, and `$POOP` drew a crowd on all 8 of its buys at a median burst of 17.00x. No wallet was CROWDED, because that needs more than half of one wallet's own buys to draw a crowd and the highest was well under it.

## Forming now

A scored buy has to be at least two days old, because its 24 hour return has to settle and the profiler endpoint does not honor a `date.to` bound inside roughly the last day. The burst does not need that wait: it reads the 10 minutes after a buy against the hour before it, so it settles `BURST_MINUTES + MATURITY_MINUTES` after the buy.

Every run therefore closes with a forming pass over the newest buys its wallets made in the last `FORMING_WINDOW_HOURS` hours, scoring burst alone, no prices and no returns. Those buys were already fetched and stored during the wallet fetch, so the pass costs tape reads and nothing else, and it runs under its own request and time budget so it can never block a scored run from publishing. Anything whose burst window has not closed, or whose token was too busy to read, is left out.

Measured on run `manual-base-7` on 2026-09-16: the pass returned 15 buys, the newest 42 minutes old, one of them crowded at 4.32x against a prior-hour rate of 25 buyers. The run's oldest scored buy on the same board was 29 days old.

The board also names an address cluster: seven of the thirty wallets carry byte-identical buy lists under different transaction hashes, the same eight tokens at the same minutes with the same returns. That is a fleet, not a duplicated row, and the scan page says so under each address, because seven identical rows would otherwise read as a rendering fault and their scored buys are one set of observations rather than seven.

## Endpoints used

Zatto reads four Nansen endpoints, all redistribution-allowed with attribution: `token-screener`, `tgm/dex-trades`, `profiler/dex-trades`, and `tgm/token-ohlcv`. Every page in the app shows "Powered by Nansen API".

## Prior work

[github.com/sneg55/anthroalert](https://github.com/sneg55/anthroalert) is a March 2026 Nansen CLI challenge entry. It is unrelated code; nothing from it is reused here.

## License

MIT, see `LICENSE`.
