# ICB test v2.1 (pre-registered) — Venn-ABERS calibration — FAILED, not shipped

Pre-registration: PREREG_v2.1.md (SHA-256 in PREREG_v2.1.sha256, with the script and the venn-abers 1.5.4 source tarball).
Calibrator: `venn_abers.VennAbers` (open source, MIT) fitted on out-of-fold v2 probabilities of the 533 training crises (<=1989).

## Holdout (1990-2021, 216 crises; third use of this holdout)
| | log-lik | Brier |
|---|---|---|
| v2 raw (shipped) | **-87.29** | **0.1256** |
| v2.1 Venn-ABERS merged | -88.41 | 0.1274 |
Mean interval width [p0, p1]: 0.029.

| Quartile of v2 prediction | mean p0 | mean p1 | war rate | inside |
|---|---|---|---|---|
| 1 | 0.045 | 0.073 | 0.037 | no |
| 2 | 0.107 | 0.120 | 0.111 | yes |
| 3 | 0.202 | 0.219 | 0.204 | yes |
| 4 | 0.341 | 0.397 | 0.204 | no |

Pass rule (merged log-lik >= raw, merged Brier <= raw, observed rate inside the interval in >= 3 of 4 quartiles): **not met**
(log-lik and Brier worse, 2 of 4 quartiles inside). Per the pre-registration the app keeps the v2 probability and shows no interval.

## What this tells us
- On the training era the v2 layer is already well calibrated out of fold (mean out-of-fold prediction 0.196 vs war rate 0.193), so
  Venn-ABERS has little to correct and its intervals are narrow (0.03).
- The top-quartile over-prediction on 1990-2021 (0.37 vs 0.20) is therefore a **shift between eras**, not a calibration error that a
  calibrator fitted on the past can fix. Venn-ABERS' validity guarantee assumes exchangeable data, which a time split breaks; this result
  shows that in practice.
- Consequence for the product: the honest fix is recalibration on recent crises (post-2021 data), not a fancier calibrator on old ones.
