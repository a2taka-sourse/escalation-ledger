# ICB real-crisis test v2 (pre-registered after v1 failed) - PASSED, narrowly

Model: L2 logistic on Jev's 10 items (3-run mean) + POWDIS, penalty by 5-fold CV on train (chosen l2 = 10). Train <=1989 (533), holdout 1990-2021 (216).
Jev cost for the whole ICB study: 2,072 paid answers, USD 0.1184; 175 free answers.

## Holdout (1990-2021)
| Model | log-lik | Brier | AUC |
|---|---|---|---|
| **v2: Jev items + POWDIS** | **-87.29** | 0.1256 | 0.648 |
| Jev items only | -91.78 | 0.1325 | 0.596 |
| Power only (same CV procedure) | -87.88 | 0.1207 | 0.674 |
| Base rate (19.3%) | -89.25 | 0.1226 | 0.500 |
Holdout war rate 13.9%. Pre-registered rule (beat base rate and power-only on log-likelihood): **PASS**, by 0.6 and 2.0 nats.

## Read it honestly
- The margin over power-only is small and does not hold on Brier or AUC, where power-only is better. Under v1's unpenalised
  power-only specification (-86.49) v2 would lose. Out of time, Jev adds little beyond the power balance.
- Calibration: lower three quartiles are well calibrated (0.06/0.04, 0.12/0.11, 0.20/0.20); the top quartile over-predicts (0.37 vs 0.20),
  consistent with the lower war rate after 1989.
- Within the training era the Jev items are clearly informative: leave-one-decade-out CV (1918-1989) log-lik v2 -250.2,
  Jev-only -247.4 vs power-only -269.8 and base rate -268.6 (about +18 to +21 nats).
- Strongest items (standardised coefficients): J4 commitment problem +0.50, J3 misperception +0.46, J2 defender's stakes +0.34,
  J10 defender cohesion -0.28, J9 "other circumstance" -0.38, J6 private gains +0.22.

## Data limitations (ICB itself)
- Source depth shifts over time (ICB SOURDT): coded from all sources incl. documents and memoirs for 40% of 1918-45 actor-cases,
  24% of 1946-89, but only 8% of 1990-2021; most post-Cold War cases rest on chronologies and articles. Train and holdout therefore
  differ in input quality, one plausible reason Jev's out-of-time gain is small.
- Regional coverage follows documentation: actors in Asia 396, Europe 342, Africa 220, Americas 159, Oceania 7. Small crises in
  less-documented regions are likely under-recorded or coded more coarsely; English-language sources dominate.
- Codes such as issue, gravity and regime are researchers' judgements of decision-makers' perceptions, within a Western IR framework.
- Selection: only events that became foreign-policy crises are in the data. The model answers "given a crisis, will it reach
  full-scale war?", not "will a crisis happen?".
- The news layer in the app has its own source bias (whatever the Telegraph miner indexes, mostly English); it is shown as unvalidated.
