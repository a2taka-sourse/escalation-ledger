# Technical-score plan (H2 rubric: "Technical quality and mainnet readiness", 35 pts, minimum 24)

Written 2026-11-21. Status markers: DONE (in the working tree), TODO-TEST (written, not yet run), PLAN.

## Done in this session (no commands run; must be tested before commit)
| Item | Where | Status |
|---|---|---|
| Per-client rate limit on paid assessments (sliding window, default 6/hour, `RATE_PER_CLIENT_PER_HOUR`) | `server.mjs` | DONE, tested 2026-11-21 (7th call -> 429 `rate`; other client unaffected) |
| CI on every push: `npm ci`, offline tests, syntax checks | `.github/workflows/test.yml` | DONE locally (`npm test` 11/11 ok); runs on GitHub after push |
| OpenAPI 3 description of the API (requests, responses, error kinds) | `docs/openapi.yaml` | DONE (doc) |

Next session, before anything else: `npm test`, start the server, one bad-input call (400), seven quick assess calls from one client to see
the 7th refused with `kind: "rate"` (use bad input to avoid spending), then commit, bundle for Muse, mirror to H.

## OSS candidates that would raise technical quality (ranked by value / effort)

### 1. Venn-ABERS calibration -> probability intervals — TRIED 2026-11-21 as pre-registered v2.1: FAILED, not shipped (RESULT_v2.1.md)
- What: wrap the frozen v2 logistic layer with inductive Venn-ABERS calibration so the app shows "P(war) between a and b" with the
  method's validity guarantee instead of a single number. Python package `venn-abers` (PyPI, `VennAbersCalibrator`, scikit-learn
  compatible; method by Vovk and Petej 2014).
- Why it scores: directly answers the weakness we already report (top quartile over-predicts 0.37 vs 0.20; out-of-time gain small).
  An interval that widens where the model is unsure is "technical correctness" a reviewer can check.
- How: calibrate on a split of the 1918-1989 training set only; precompute a score -> [p0, p1] lookup table into `model_v2.json`
  (no Python at run time; the JS side does a table lookup). Evaluate interval calibration on the 1990-2021 holdout and **disclose that this
  holdout has been used before** (v1, v2). Pre-register as v2.1 with a SHA-256 like v1/v2.
- Effort: about half a day including pre-registration and the parity test. Unverified: the exact interval API of the package (check README).

### 2. VIEWS forecasts as an external expert benchmark (show, do not blend)
- What: VIEWS (Uppsala/PRIO) publishes open monthly forecasts of state-based conflict fatalities by country, 1-36 months ahead, with
  code on GitHub (`prio-data/views_pipeline`) and an API / downloads.
- Why it scores: places our estimate next to an established, peer-reviewed open forecasting system; reviewers see we benchmark against
  the field, not only against our own baselines.
- How: for the defender country, fetch the latest VIEWS country-month forecast and show it in a third card, labelled as a different
  quantity (fatalities, not crisis-to-war probability). Unverified: API endpoint and licence terms (check viewsforecasting.org / viewser).
- Effort: about half a day once the endpoint is confirmed.

### 3. UCDP Candidate events as the blind-judged "street-level" input (v3, December challenge)
- What: UCDP's monthly Candidate events (served via the free UCDP API as `gedevents`), plus GED annual data.
- Use: counts/trend of events between the two parties in the 30 days before onset, written as anonymised text for Jev, exactly as in
  `validation/icb/NEXT_v3.md`. Licence for Candidate not confirmed (GED is described as CC BY 4.0 by a third-party guide).
- Blocker already known: too few post-1989 wars for a convincing test (2010-2021: 101 cases, 10 wars). Keep for December.

### 4. Smaller engineering items (cheap, visible in code review)
- Input validation generated from `docs/openapi.yaml` (e.g. `ajv`) so the API contract and the code cannot drift.
- Atomic budget updates in Redis (`INCRBYFLOAT` per day key instead of GET/SET of one JSON blob) to remove the race between two
  concurrent requests. Today this is bounded by `MAX_CONCURRENT = 2`, but it is a real correctness gap.
- Request IDs and one structured JSON log line per assessment (no secrets), so a reviewer's run can be matched to a receipt.
- Jev answer cache keyed by SHA-256 of the exact state text: identical inputs return identical numbers and cost nothing.

## Mainnet readiness (what changes when Telegraph mainnet exists; no date has been published)
- Payment network and asset come from configuration, never code; refuse unknown networks. Keep `maxAmountPerPayment` per call.
- Use escrow for batched calls (documented on Telegraph: fund once, no per-request settlement) once volume justifies it.
- Keys: move the wallet key from an environment variable to a managed secret store; separate low-balance hot wallet with daily top-ups.
- Authentication on `/api/assess` (API keys per customer) and per-customer budgets; the per-client rate limit stays as a backstop.
- Recalibrate on post-2021 crises before any production claim; keep the pre-registration habit for every model change.

## Sources checked for this plan (2026-11-21)
- VIEWS pipeline: https://github.com/prio-data/views_pipeline ; overview https://uu.se/en/department/peace-and-conflict-research/research/views
- Venn-ABERS package: https://pypi.org/project/venn-abers/
- UCDP API: https://ucdp.uu.se/apidocs/ ; downloads https://ucdp.uu.se/downloads/

## Status after running the whole plan (2026-11-21)
| # | Item | Result |
|---|---|---|
| 1 | Venn-ABERS calibration (pre-registered v2.1) | FAILED its pre-registered test, not shipped (`validation/icb/RESULT_v2.1.md`). Finding: the post-1989 over-prediction is a shift between eras. |
| 2 | VIEWS external benchmark | DONE. `src/views.mjs`: latest `fatalities*` run from api.viewsforecasting.org (alpha, no auth; API repo MIT), `cm/sb?iso=` per party, cached 6 h, failures isolated. Third UI card with "different quantity, not blended". Live check: CHN/TWN from run `fatalities003_2026_09_t01`. Data licence for the forecasts themselves not confirmed; cited as VIEWS. |
| 3 | UCDP Candidate street-level input (v3) | DEFERRED to December as planned: post-1989 test set too small (2010-2021: 10 wars). |
| 4a | Contract test OpenAPI <-> code | DONE (`scripts/test-contract.mjs`, in `npm test`). It immediately caught drift: the app accepted regime codes 6-7 and alliance code 5 that are not in the ICB codebook (my own additions, never in the data). Removed. |
| 4b | Budget ledger race | DONE for the deployed shape: all ledger read-modify-writes are serialised in-process (single instance on the free plan). Remaining: concurrent reserve checks can overshoot by at most MAX_CONCURRENT calls; multi-instance would need a Redis-side script. |
| 4c | Request IDs + structured logs | DONE: `X-Request-Id` header, `request_id` in every JSON body, one JSON log line per request with signal_hash / settlement_tx / cache / news shift; no secrets, no bodies. |
| 4d | Jev answer cache | DONE: SHA-256 of the exact situation text, 24 h, in memory. Live: second identical run 4.4 s vs 23.7 s, Jev cost 0. |
| M | Mainnet readiness: payment config | DONE: `TELEGRAPH_PAY_NETWORK`, `TELEGRAPH_PAY_ASSET`, `TELEGRAPH_MAX_PER_CALL`; unknown network without an explicit asset refuses to start (tested). Remaining items in the section above need a mainnet. |

Tests now: `npm test` = 22 offline checks (budget 4, news shift 7, contract 11) + `scripts/test-parity.mjs` (text 749/749, model 1.7e-16) + CI on push.

## Known limitation found while testing
- The rate limit keys on the first `X-Forwarded-For` entry, which a client can set. The daily spending caps remain the real backstop.
