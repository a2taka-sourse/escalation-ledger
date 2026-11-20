# ICB real-crisis test v1 (pre-registered) - FAILED

Pre-registration: PREREG.md (+ Amendment 1, paid Jev fallback). Jev: 2,229 answers, 2,054 paid, USD 0.1174 total.
Train 533 crises (<=1989), holdout 216 (1990-2021). Outcome: defender in full-scale war.

## Holdout (1990-2021, never used for fitting)
| Model | log-lik | per case | Brier | AUC |
|---|---|---|---|---|
| Full model (game + Jev) | -127.69 | -0.591 | 0.199 | 0.51 |
| No Jev (game, neutral) | -127.67 | -0.591 | 0.199 | 0.45 |
| **Power only (logistic on POWDIS)** | **-86.49** | -0.400 | 0.119 | **0.67** |
| Base rate (train 19.3%) | -89.26 | -0.413 | 0.123 | 0.50 |
| Logistic regression (same coded vars) | -93.36 | -0.432 | 0.128 | 0.61 |
Holdout war rate 13.9%.

Pass criterion (beat base rate AND no-Jev): **not met**. The full model is ~38 nats worse than the base rate.

## Why (diagnosis, exploratory)
- The fitted QRE precision collapsed to lambda = 0.046 (下腦 fit: 7.7). With near-random choices the game's war probability sits at its
  floor ~0.417 for every case (holdout predictions 0.409-0.425). It cannot express a 14-19% war rate, so it cannot even match the base rate.
- Likely cause: the pre-registered mapping popT = popD (the whole defender state is at stake) plus 下腦's pre-modern constants make war
  look attractive to the attacker in almost every crisis; sharpening choices (higher lambda) would only push P(war) up, so the fit flattens them.
- Jev itself carries signal: on TRAIN, single Jev items separate war from no-war with AUC 0.60-0.65 (J4 commitment problem 0.64,
  J6 private gains 0.65, J7 ruler's risk 0.62, J3 misperception 0.60). The failure is in the game layer, not in Jev.

## Known data issue
6 duplicate case ids (12 of 533 training rows, all 1935-1970): two ICB2 rows for the same actor in one crisis shared one id, so the second
row reused the first row's Jev answers and the outcome file kept only one value. Training only; cannot explain a 38-nat gap.
