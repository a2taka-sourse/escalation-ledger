# v3 scored on all four violence levels (pre-registered, PREREG_v3_ordinal.md) — primary test FAILED

Sixth use of the 1990-2021 holdout (216 crisis actors), disclosed in the pre-registration. No model was refitted: the four-level
probabilities come from the frozen v3 fit (its P(full-scale war) matches `fit_v3.py` exactly, max difference 0.0).

## Why this test
On the binary outcome, post-hoc cluster-bootstrap 95% CIs of v3 minus each baseline all include 0 (`data/posthoc_ci_v3.json`):
v2 -3.1..+13.3, power-only -5.1..+12.9, base rate -2.7..+16.8. Scoring all four ICB levels (no violence / minor clashes / serious clashes /
full-scale war) was meant to use more of each case's information.

## Result (`fit_v3_ordinal.py`, `data/result_v3_ordinal.json`)
| Model | four-level log-lik | mean RPS (lower is better) |
|---|---|---|
| **v3** | **-287.41** | **0.1774** |
| B0 ordinal base rate | -293.34 | 0.1912 |
| B1 ordinal power-only | -312.13 | 0.2054 |

- **Primary (v3 minus B0), 95% CI: -45.5 to +38.4 -> FAIL** (positive in 66% of resamples).
- Secondary (v3 minus B1), 95% CI: **+10.9 to +37.8** (positive in 100% of resamples): on four levels v3 is clearly better than the
  power-balance model.
- Observed shares of levels 1-4: 0.319 / 0.319 / 0.222 / 0.139. v3's mean predictions: 0.414 / 0.233 / 0.193 / 0.160, so it
  over-predicts "no violence" and under-predicts "minor clashes".

## Why the interval is so wide (diagnostic, after the result; not used for pass/fail)
One crisis dominates. ICB crisis 430 (Kosovo, 1999) has 11 crisis actors in the holdout, mostly NATO members. v3 gave several of them
88-97% "no violence"; the outcome was "serious clashes". These states had no crisis history with the adversary and a favourable power
balance; they fought as members of a coalition. The cluster bootstrap resamples whole crises, so whether 430 is drawn or not swings the
total by tens of log-lik points.

## What this means
- Claim kept: point estimates favour v3 on every metric, and v3 beats power-only clearly on four levels. Claim not made: that v3 is
  better than the base rate with 95% confidence. The holdout is too small and too clustered to show that.
- **Known limitation, now documented: coalition members joining an intervention** (no bilateral history, strong side) are predicted to
  stay out of the fighting. The app's model is unchanged.
