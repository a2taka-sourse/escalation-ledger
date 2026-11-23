# ICB test v3 (pre-registered) — ordinal outcome + rivalry history — PASSED; shipped

Idea source: the author's horse-racing ML work (past-performance "form" features, using the full finishing order, Benter-style checks
against the strongest simple baseline). Selected on TRAIN ONLY among 11 variants (screen_v3.py, leave-one-decade-out CV 1918-1989):

| Variant (train decade-CV log-lik) | |
|---|---|
| **ordinal VIOL 1-4 + rivalry history** | **-240.2** |
| + rivalry history | -242.2 |
| Benter-style blend v2 x power-only | -244.1 |
| ordinal only | -246.7 |
| v2 | -247.2 |
| recency weights (tau 15 / 30 y) | -256.1 / -251.5 |
| base rate / power-only | -268.6 / -270.3 |
| gradient boosting + rivalry | -298.5 (too little data) |
Cluster bootstrap (by crisis) 95% CI for v2 minus base rate on train decade-CV: +3.8 to +38.4.

## Holdout (1990-2021, 216 crises; fifth use of this holdout, disclosed in PREREG_v3.md)
| Model | log-lik | Brier | AUC |
|---|---|---|---|
| **v3** | **-81.84** | **0.1182** | **0.707** |
| v2 | -87.29 | 0.1256 | 0.648 |
| power-only | -87.88 | 0.1207 | 0.674 |
| base rate | -89.25 | 0.1226 | 0.500 |
Calibration by quartile (mean prediction / war rate): v3 0.036/0.037, 0.095/0.056, 0.170/0.204, 0.338/0.259
(v2 top quartile was 0.365/0.204).

Pass rule (v3 log-lik > v2): **PASS**. Cluster bootstrap 95% CI of v3 minus v2: **-2.9 to +13.3** (includes 0: the gain over v2 is
likely but not certain). v3 is the first model here that beats power-only on log-likelihood, Brier and AUC at once.

## In the app
`src/model.mjs predictV3` + `src/rivalry.mjs` (ICB history to 2021, COW names with common aliases; an unmatched name falls back to the
training average and is flagged). JS vs Python parity on all 216 holdout cases: max difference 2.2e-16.
