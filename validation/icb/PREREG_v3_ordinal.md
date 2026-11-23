# Pre-registration: v3 scored on all four violence levels (2026-11-24)

Written and hashed before any four-level holdout number is computed.

## Why
On the binary outcome (full-scale war or not), the 216-crisis holdout is too small to separate any model from the base rate at 95%:
post-hoc cluster-bootstrap CIs of v3 minus v2 / power-only / base rate all include 0 (`posthoc_ci_v3.py`, `data/posthoc_ci_v3.json`:
-3.1..+13.3, -5.1..+12.9, -2.7..+16.8). v3 is an ordinal model of ICB VIOL 1-4 (no violence, minor clashes, serious clashes, full-scale
war). Scoring the whole predicted distribution uses more of each case's information. **No model is refitted or changed.**

## Model under test
The frozen v3 exactly as in `fit_v3.py` / `PREREG_v3.md` (same training cases 1918-1989, same features, same standardisation, L2 = 10,
same optimiser). Its four-level probabilities come from the same fitted cut points and coefficients. Check before scoring: its
P(VIOL=4) on the holdout must equal `fit_v3.py`'s predictions (max abs difference < 1e-9), otherwise stop.

## Baselines (fitted on the training cases only)
- **B0 ordinal base rate**: the training-set frequencies of VIOL 1, 2, 3, 4, the same for every case.
- **B1 ordinal power-only**: the same proportional-odds fit (`fit_ordinal`, L2 = 10) with POWDIS/50 as the only feature.

## Holdout and metric
The same 216 holdout cases (1990-2021) used for v1, v2, v2.1, the auto-coding test and v3. **This is the sixth use of this holdout.**
The author has seen the binary (war / no war) results and the post-hoc binary CIs above; the four-level scores of any model on the holdout
have not been computed.
- Score: log-likelihood = sum over cases of log P(observed VIOL), probabilities clipped at 1e-9.
- Paired cluster bootstrap by ICB crisis number, 5,000 resamples, `numpy.random.default_rng(0)`, 95% percentile interval.

## Pass rule
- **Primary — PASS if the lower end of the 95% CI of (v3 minus B0) is above 0.**
- Secondary (reported either way, no pass/fail): v3 minus B1 CI; mean ranked probability score (RPS, lower is better) for v3, B0, B1;
  four-level calibration (mean predicted vs observed share of each level).

## What happens with each outcome
- PASS: the README and submission say v3 is better than the base rate on the four-level outcome with a 95% CI that excludes 0,
  next to the binary results (which stay as reported).
- FAIL: reported as a failure; the claim stays "point estimates favour v3, the holdout is too small to be sure".
Either way nothing in the app's model changes.
