# Pre-registration: accuracy of simple-mode auto-coding (ICB v16 holdout)

Written 2026-11-21 before any auto-coding of ICB cases. Frozen by SHA-256 in PREREG_autocode.sha256 with scripts/eval-autocode.mjs and
src/autocode.mjs.

## Question
When simple mode fills the ICB codes itself (Jev reading a short text about the crisis), how often do its codes match the ICB coders,
and does the validated v2 probability computed from auto-codes still beat the base rate on the 1990-2021 holdout?

## Cases and inputs
- The 216 holdout actor-cases (1990-2021) from data/cases_v2.jsonl. Cases whose crisis summary cannot be found are skipped and counted.
- Names: Correlates of War state names for the defender (ICB actor code) and the triggering state.
- Topic: the ICB crisis name. Year: the trigger year (passed to the coder as "as of year").
- Text given to the coder (stand-in for "news at onset"): from the official ICB crisis summary, only the Background and Pre-crisis
  paragraphs and the first paragraph after "Summary:" (the trigger). The rest (course and outcome) is cut. The summaries were written
  after the fact, so some outcome knowledge may still leak through wording; this is a limitation.
- Coder: src/autocode.mjs exactly as shipped (country profile per state and year + crisis codes), Jev jev-1.13(-free).

## Metrics
1. Per-field agreement with ICB: trigger, issue, setting, geography (same region / same continent / far, from ICB locations), power side
   (attacker stronger / roughly equal / defender stronger; ICB |POWDIS| <= 2 counts as equal), and for both sides regime, state age,
   territory, nuclear, alliances; defender decision group where ICB has a value. Baseline: the most frequent code of that field in the
   training cases.
2. Downstream: v2 probability from auto-codes (fresh Jev x3 on the auto-coded anonymised text, power from the representative value) vs
   the v2 probability from ICB codes (cached answers, holdout log-lik -87.29) vs base rate (-89.25) and power-only (-87.88). Also mean
   absolute difference between the two probabilities.

## Pass rule
PASS = holdout log-likelihood with auto-codes > base rate (-89.25). If PASS, simple mode is described as "auto-coding tested on 216 real
crises (field agreement X%, downstream log-lik Y)" instead of "not validated". If FAIL, it stays "not validated" and the result is reported.

## Spending
Jev only (no Telegraph purchases). Hard cap USD 0.50 of paid Jev for this evaluation.

## Amendment 1 (2026-11-21, after a crash at 160/216, before any metric was computed)
- The first run stopped on a Jev `429 rate_limit_error` (short-term rate limit; distinct from the free-quota error). No results were written.
- Changes, infrastructure only: `src/jev.mjs` retries this specific error with backoff (2, 5, 10, 20, 30 s); the evaluation script writes a
  per-case checkpoint and resumes. Cases, text cut, coder, metrics and pass rule are unchanged. Country profiles from the first run are
  reused from `data/eval_profiles.json` (same questions, same years).
