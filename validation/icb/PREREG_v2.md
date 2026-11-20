# Pre-registration v2: calibrated probability layer from Jev's 10 items + power balance (ICB v16)

Written 2026-11-20 after v1 failed (RESULT_v1.md). Frozen by SHA-256 in PREREG_v2.sha256 together with data/cases_v2.jsonl,
data/outcomes_v2.json and fit_v2.py, before fit_v2.py is run.

## What I had already seen (disclosure)
- v1 holdout metrics of all v1 models, including the holdout war rate (13.9%) and that power-only logistic scored -86.49.
- On TRAIN only: single Jev items separate war/no-war with AUC 0.48-0.65.
No holdout prediction of any v2 model has been computed. Nothing below was tuned on the holdout.

## Change from v1
- The game (solve_game) is no longer the probability engine. It stays in the app only as an explanatory decomposition, with no
  probability claim attached.
- Data fix: 6 duplicate case ids (12 training rows) now have unique ids (`<crisno>-<actor>-2`); the 6 new rows got their own Jev answers.
  Everything else in the case set (text, split, outcome) is identical to v1.

## Model (v2)
- Features: mean of the 3 Jev runs for J1-J8 and J10 (score 0-4), J9 (noul probability), POWDIS/50. 11 features + intercept.
  Standardised with TRAIN mean/sd.
- L2-penalised logistic regression. Penalty chosen by 5-fold stratified CV on TRAIN only (seed 0) from
  {0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100}, maximising CV log-likelihood; refit on all TRAIN; freeze.
- No recalibration on the holdout, even though the war rate differs between periods.

## Compared on the holdout (all fitted on TRAIN only with the same procedure)
1. v2: Jev items + POWDIS. 2. Jev items only. 3. Power only (POWDIS). 4. Base rate. (v1 game shown for reference.)

## Metrics and pass rule
Holdout log-likelihood (primary), Brier, AUC, calibration table (quartiles of prediction). PASS = v2 beats BOTH base rate and
power-only on holdout log-likelihood. Also pre-specified, train-only: leave-one-decade-out CV log-likelihood for v2, Jev-only,
power-only and base rate (1918-29, 30s, 40s, 50s, 60s, 70s, 80s).

## Will not do
Change features, penalty grid, split or outcome after seeing v2 holdout numbers. A failure is reported as a failure.
