# Pre-registration v2.1: Venn-ABERS calibration on top of the frozen v2 layer

Written 2026-11-21, before any v2.1 number was computed. Frozen by SHA-256 in PREREG_v2.1.sha256 together with venn_abers_v21.py.

## Disclosure (what I already knew)
- All v2 holdout metrics, including its calibration table (top quartile over-predicts: mean prediction 0.365 vs war rate 0.204).
  Choosing a calibration method is therefore informed by having seen the holdout. This is the third use of the 1990-2021 holdout.
- Venn-ABERS validity assumes exchangeable data; 1918-1989 vs 1990-2021 is a time shift, so the guarantee does not formally hold here.
  The test below checks whether it helps anyway.

## Method
- Underlying scorer: the frozen v2 model (`data/model_v2.json`, L2 logistic, l2 = 10) — unchanged.
- Calibration scores: out-of-fold v2 probabilities for all 533 training crises (<=1989): 5-fold stratified split (seed 0, same fold
  construction as fit_v2.py), l2 fixed at 10, standardisation fitted inside each fold.
- Calibrator: `venn_abers.VennAbers` from the open-source package venn-abers 1.5.4 (MIT, github.com/ip200/venn-abers), fitted on
  (out-of-fold probability, outcome). For each holdout case: interval [p0, p1] and merged probability p = p1 / (1 - p0 + p1).
- The fitted tables (`c_`, `p0_`, `p1_`) are exported so the app can reproduce the package's lookup exactly in JavaScript.

## Holdout metrics (1990-2021, 216 crises)
Log-likelihood and Brier of the merged probability vs the v2 raw probability; mean interval width; for each quartile of the v2 raw
prediction (same quartile cut as fit_v2.py): mean p0, mean p1, observed war rate.

## Pass rule and what ships
PASS = merged log-likelihood >= v2 raw log-likelihood AND merged Brier <= v2 raw Brier AND the observed war rate lies inside
[mean p0, mean p1] in at least 3 of the 4 quartiles.
- If PASS: the app shows the interval [p0, p1] with the merged probability as its headline.
- If FAIL: the app keeps the v2 probability, does not show the interval, and RESULT_v2.1.md records the failure.

## Will not do
Change the fold seed, penalty, package settings or pass rule after seeing v2.1 numbers.
