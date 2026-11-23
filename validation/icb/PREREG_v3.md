# Pre-registration v3: ordinal outcome + as-of rivalry history (ideas from the horse-racing ML work)

Written 2026-11-23 before any v3 holdout number. Frozen with SHA-256 in PREREG_v3.sha256 (with fit_v3.py and screen_v3.py).

## Disclosure
- Fifth use of the 1990-2021 holdout (v1, v2, v2.1, auto-coding). Its aggregate metrics for earlier models are known.
- v3 was chosen on TRAIN ONLY: screen_v3.py compared 11 variants with leave-one-decade-out CV on 1918-1989
  (data/screen_v3.json). The chosen variant had the best CV log-likelihood (-240.2 vs v2 -247.2). No holdout number was looked at.

## Model (fixed, no tuning on holdout)
- Features: the 11 v2 features (Jev J1-J8, J10, J9, POWDIS/50) plus 4 as-of rivalry features computed from ICB2 rows with a strictly
  earlier trigger year: log(1 + past crises between the same two states), smoothed share of those that reached full-scale war for the
  actor (wars / (n + 1)), log(1 + past crises of the defender), smoothed share of the defender's past crises that were full-scale war
  (wars / (n + 2)). Standardised with train mean/sd.
- Outcome: proportional-odds (ordinal logit) model on ICB VIOL 1-4 (no violence, minor clashes, serious clashes, full-scale war),
  L2 = 10 on slopes. Prediction = P(VIOL = 4).
- Fit on all 533 training crises (<= 1989), then frozen.

## Holdout metrics
Log-likelihood (primary), Brier, AUC, calibration by quartile; cluster bootstrap (by crisis, 2,000 draws, seed 0) 95% CI of the
log-likelihood difference v3 - v2.

## Pass rule
PASS = v3 holdout log-likelihood > v2 (-87.29). If PASS, v3 replaces v2 in the app (the app computes the rivalry features from the ICB
history for the two named states). If FAIL, v2 stays and the result is reported.
