# Escalation Ledger

**Telegraph Hackathon Season II · Apps & Agents · Mission 05 Conflict Intelligence**

Given a crisis between two states, Escalation Ledger returns the probability that it ends in full-scale war, and a receipt for every
piece of intelligence it bought to get there.

- **Simple mode.** Name two states and one topic line. The agent buys the news on Telegraph, Jev picks the ICB crisis codes from it
  (shown with confidence, editable), and the validated model computes the estimate from the anonymised codes only. The auto-coding was
  tested against ICB coders on 216 crises (pre-registered): above baseline on 11 of 16 fields, but estimates from auto-codes were no better
  than the base rate (`validation/icb/RESULT_autocode.md`), so simple mode is a fast draft to check, not a validated estimate.
  Repeating the same topic reuses the purchase and the Jev answers (0.7 s instead of ~25 s).
- **Validated base estimate.** The crisis is coded into the same anonymised text format as 533 historical crises (ICB v16, 1918-1989).
  Jev (a judgement model) scores 10 Fearon-style bargaining factors; a frozen logistic layer turns them into P(war). Tested out of time on
  216 crises from 1990-2021 under a pre-registered rule.
- **What the news changes (not validated).** The agent buys recent news on Telegraph (`NEWS_SEARCH_GENERAL`, x402, test USDC), lets Jev
  re-score with the news attached, and shows how far and why the estimate moved.
- **Receipt.** Telegraph `signal_hash` (verifiable at `/engine/v1/signal/{hash}`), x402 settlement transaction, payer, miner, price, latency,
  and the Jev cost.
- **External benchmark (context only).** With ISO-3 codes, the app shows the latest open VIEWS forecast (Uppsala University & PRIO)
  for each party: P(>= 25 battle deaths per month) and predicted fatalities. A different quantity, never blended.

> Research prototype on the Telegraph **testnet**. Not a forecasting service. Read "How far to trust it" before using any number.

**Live demo: <https://escalation-ledger.onrender.com>** (free hosting: after 15 idle minutes the first request takes up to ~1 minute
to wake the server; an assessment then takes ~20-40 s). Pick a preset and press Assess; the receipt links to the Telegraph signal and the
Base Sepolia settlement. Daily caps apply (100 runs/day).

Hosted run, 2026-11-20 (Russia -> Ukraine, violent trigger): base 30.3 %, news shift up / large, Jev `jev-1.13-free`, signal_hash
`0xeb4d5f80326261a7cbd0221e9a47caf26c18321270969272631185985c256676`, settlement tx
`0x4479bb0061ef05590f18ccab859517e2463d2f4ca8ca6985dd391eda9e9f996c`, 21.8 s.

## Quick start (about 10 minutes)

### Prerequisites
- Node.js 20+ (tested on 24.18).
- An **OpenCode Zen** API key (Jev is served at `https://opencode.ai/zen/v1/systemone`; free model `jev-1.13-free`).
- Test USDC on Base Sepolia from <https://faucet.circle.com> (free; no ETH needed: x402 payments are gasless for the payer).

### Install and configure
```bash
npm install
node scripts/new-wallet.mjs          # creates a throwaway TESTNET wallet in .env and prints its address
# send Base Sepolia USDC to that address from faucet.circle.com
export OPENCODE_ZEN_KEY=...          # or keep it in ~/.local/share/opencode/auth.json (opencode CLI login)
```

### Check the Telegraph integration (6 paid calls, 0.06 test USDC)
```bash
node scripts/discover.mjs            # free: schemas, miner counts, unpaid 402 quotes
node scripts/probe-buy.mjs           # buys 6 intents, writes receipts/day1-*.json
```

### Run the app
```bash
node server.mjs                      # http://localhost:8787  (UI + API)
```
Sample request:
```bash
curl -X POST localhost:8787/api/assess -H "Content-Type: application/json" -d '{
  "attacker_name":"China","defender_name":"Taiwan",
  "triggr":"7","issue":"2","pc":"2","geo":"same_region","power":"attacker_much",
  "attacker":{"regime":"2","age":"1","territ":"3","nuclear":"4","allycap":"4"},
  "defender":{"regime":"1","age":"5","territ":"1","nuclear":"1","allycap":"2","sizedu":"2"}}'
```
Expected: HTTP 200 in ~20-40 s with `base.p_war`, `news_adjusted.shift` (direction + level) and `news_adjusted.moved_by` (or `unavailable` with a reason; the raw
unvalidated number stays in `news_adjusted.raw` for inspection), per-factor `contributions`,
and `telegraph_purchase` containing `signal_hash`, `verify_url` and `settlement_tx`. Every run is also saved to `receipts/runs/`.
Code lists for the fields: `GET /api/options`. Budget and model info: `GET /api/status`.

Example result (2026-11-20, China -> Taiwan, show of force): base 10.3 %, news shift up / large, signal_hash
`0x929cf99cfe04fa1e4a422843a77bd8bea74e4275a1b046d12e1b8d61ca3df72f`, settlement tx
`0x11ca7886372d1483eb319dcee867bdd561fef14a30acedad9d23a2316da6b586` (Base Sepolia), 21.5 s.

### Tests
```bash
npm test                             # 22 offline checks: spending guard, news-shift labels, OpenAPI contract (also run by CI)
node scripts/test-budget.mjs         # spending guard (offline)
node scripts/test-parity.mjs         # JS text == training text (749/749) and JS model == Python (needs ICB data, see validation/)
```

## Failure behaviour ("Break it")
| Case | What happens |
|---|---|
| Invalid or missing field | HTTP 400 with the field name, before any money is spent |
| Telegraph purchase fails (timeout, miner error) | Base estimate is still returned; `news_adjusted.unavailable` carries the reason |
| x402 settlement hiccup at the facilitator | Retried once automatically (seen on 2026-11-20) |
| Jev free quota exhausted (`FreeUsageLimitError`) | Falls back to paid `jev-1.13` only if the budget allows; otherwise HTTP 429 |
| Daily run / spend caps reached | HTTP 429 with the cap that was hit |
| Two requests already running | HTTP 429 "busy" |
| More than 6 assessments per hour from one client | HTTP 429 `kind: rate` |
| VIEWS unavailable or unknown ISO code | Benchmark card shows "unavailable"; the assessment is unaffected |
| Unknown payment network without an explicit asset | Server refuses to start |

## Costs and limits
| Item | Per assessment | Caps (env) |
|---|---|---|
| Telegraph `NEWS_SEARCH_GENERAL` | 0.01 test USDC (Base Sepolia, x402) | `TELEGRAPH_DAILY_USD` = 1.00 |
| Jev x6 (3 base + 3 news) | free, or USD 0.0000572 per call on paid `jev-1.13` (~USD 0.00034) | `JEV_PAID_DAILY_USD` = 0.05, `JEV_PAID_TOTAL_USD` = 1.00 |
| Runs | | `RUNS_PER_DAY` = 100, `MAX_CONCURRENT` = 2 |

Real money spent building and validating this (as of 2026-11-20): about USD 0.12 of paid Jev (~2,080 calls). Telegraph spending is test USDC only.

## How far to trust it
- **Validation** (`validation/icb/`): v1, the 下腦 game-theory engine (Fearon bargaining + quantal response) transplanted as-is, **failed**
  the pre-registered test (worse than the base rate). v2, a logistic layer on Jev's 10 items + power balance, **passed narrowly**:
  holdout log-likelihood -87.29 vs base rate -89.25 and power-only -87.88. It does **not** beat power-only on Brier or AUC, and its top
  quartile over-predicts war (0.37 vs 0.20 observed). Within 1918-1989 (leave-one-decade-out) the Jev items help clearly (+18 nats).
  v2.1 (pre-registered) added Venn-ABERS calibration with the open-source `venn-abers` package: **failed** (holdout log-lik -88.41
  vs -87.29), because the v2 layer is already calibrated within 1918-1989; the over-prediction after 1989 is a shift between eras. Not shipped
  (`validation/icb/RESULT_v2.1.md`).
- **Data**: ICB is hand-coded by researchers from mostly English sources; post-1989 cases rest on thinner sources and coverage is uneven
  by region. The model answers "given a crisis, will it reach full-scale war?", not "will a crisis happen?".
- **News adjustment** is not validated: named, recent news is a different input distribution from the anonymised training text, and the
  shift can be large (+44 and +61 pts in two runs). The UI therefore shows only direction and level
  (negligible <3, small 3-10, moderate 10-25, large >=25 pts) and the factors the news moved; it never shows a news-adjusted probability.
- **Power balance** is entered as a 7-level choice mapped to representative ICB power-discrepancy values.

## Telegraph integration
- Default rail: **escrow on the Ethereum Sepolia Diamond** (`TELEGRAPH_RAIL=escrow`): deposit once (`node scripts/fund-escrow.mjs`), each ask is
  authorised with an EIP-191 signature, uses `max_budget_usdc` so Telegraph routes to several ranked miners, bills one row per used answer
  in the epoch ledger root, and never bills a failed call. Each row's `receipt_hash` can be proven at `/v1/blocks/{epoch}/deliveries/{hash}`.
  If escrow is unusable (no option, or the node has not yet credited a deposit) the app falls back to x402.
- Fallback rail: x402 `exact` on Base Sepolia (`eip155:84532`), Circle test USDC, per-call spend control 0.01 USDC.
- Every purchase is inspectable: `GET https://devnode.telegraphprotocol.com/engine/v1/signal/{signal_hash}` returns the signal, the payload
  it was hashed over and the paying wallet.
- Network findings from building this (see `DAY1.md`): failed Base Sepolia requests are still charged; LLM-fallback answers are billed
  while `cost_usd` reports 0; `FACT_CHECK` returned an empty verdict; no Intent offers live prediction-market odds
  (`docs/ISSUE_DRAFT_prediction_market_odds.md`).

## Repository map
`server.mjs` HTTP server · `public/index.html` UI · `src/pipeline.mjs` assessment · `src/codes.mjs` coded-text builder ·
`src/jev.mjs` Jev client + paid fallback · `src/model.mjs` frozen v2 layer (`src/model/model_v2.json`) · `src/telegraph.mjs` x402 purchases ·
`src/budget.mjs` caps · `src/game.mjs` port of the 下腦 game (kept for reference; failed on real crises) · `validation/` all pre-registrations,
scripts and results.

## Data credit
International Crisis Behavior Project, v16 (Brecher, Wilkenfeld et al.), <https://sites.duke.edu/icbdata/>. Raw ICB files are not
redistributed here; download them into `data/icb_raw/` to rerun the validation.
