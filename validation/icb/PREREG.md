# Pre-registration: war-judgment game on real crises (ICB v16)

Written 2026-11-20, before any Jev answer or any fit on ICB data was computed. Frozen by the SHA-256 recorded in `PREREG.sha256`
together with `data/cases.jsonl` and `data/outcomes.json`. Outcome base rates have not been inspected.

## Question
Does the 下腦 war-judgment game (Fearon bargaining + agent-logit QRE, Jev quantifies the unmeasurable weights), calibrated only on
crises up to 1989, predict which post-1989 crisis actors end up in full-scale war better than simple baselines?

## Data
- International Crisis Behavior v16, actor level (ICB2), 1918-2021 (Brecher, Wilkenfeld et al.; sites.duke.edu/icbdata).
- Unit: crisis actor D (threatened state) and the single state A that triggered its crisis (TRIGENT). Non-state, internal and
  multi-state triggers dropped. Rows without a power-discrepancy score dropped. Result: 749 cases.
- Outcome: D experienced full-scale war (VIOL == 4). Secondary outcomes are NOT analysed (no forking).
- Split: train = trigger year <= 1989 (533), holdout = 1990-2021 (216). The holdout is not touched until the model is frozen.

## Inputs
- Jev sees only an anonymised, outcome-blind text built from onset-time ICB codes: era (interwar/WWII, Cold War, post-Cold War),
  trigger type, initial issue, protracted-conflict setting, both regimes, state age, territory, nuclear capability, alliance
  capability, D's decision-group size, verbal power balance, same region / continent / far. No names, no years, no violence,
  crisis-management, outcome or termination variables.
- Jev: OpenCode Zen `jev-1.13-free`, same 10 questions as the September v04 model (J1-J8, J10 score; J9 noul), 3 runs per case,
  answers cached and frozen. No paid fallback.
- Game numbers: popD = 1e7 (nominal), popA = popD * exp(-POWDIS / s), popT = popD, distance A->D = 300 km same region /
  1500 km same continent or unknown / 6000 km otherwise, distD = 0, no terrain terms, era e4 (<=1945) / e5 (>1945).
  All other constants exactly as `ngcm_war_game.py` (solve_game reused unchanged).
- Prediction: P(war) = solve_game(...)["戦争"].

## Free parameters (fitted on train only, MAP with priors)
log lambda ~ N(ln 5, 1.5), log Lambda ~ N(ln 800, 0.5) (same priors as 下腦), log s ~ N(ln 20, 1). Multi-start (6), L-BFGS-B.

## Models compared on the holdout (all fitted on train only, then frozen)
1. Full model (Jev weights).
2. No Jev: neutral weights (same game, refitted).
3. Power only: logistic regression on POWDIS.
4. Base rate: training frequency of war.
5. Logistic regression on the same coded variables Jev sees (one-hot categoricals + POWDIS/50 + same_region), L2 = 1.0.

## Metrics
Holdout log-likelihood (sum and per case), Brier score, ROC AUC. Primary: log-likelihood.
A "pass" = full model beats base rate AND no-Jev. Beating the logistic regression is reported but not required;
losing to it is reported as a limitation, not hidden.

## Will not do
Refit after seeing holdout results, change the text template, drop cases, or swap the outcome definition. Any later change is a new,
separately labelled version.

## Amendment 1 (2026-11-20, before any fit or outcome inspection)
- Reason: OpenCode Zen returned `FreeUsageLimitError` after 175 of 2,247 Jev answers.
- Change: when (and only when) the free model returns FreeUsageLimitError, the same question is sent to the paid `jev-1.13`;
  the model used is recorded per answer. Hard budget cap for this validation: USD 0.50 (stop, keep cache).
- Evidence the two are the same judge: one paid probe on case 1 gave scores within the spread of its 3 free runs on every item
  (e.g. J1 2.99 vs 3/3/3, J2 3.02 vs 3.12/3.09/3.06, J9 0.62 vs 0.64/0.61/0.64). Measured unit price USD 0.0000572 per call.
- Nothing else changes (cases, text, outcome, split, models, metrics).
