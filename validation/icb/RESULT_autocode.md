# Simple-mode auto-coding vs ICB coders (pre-registered) — FAILED the downstream test; field agreement mixed

Pre-registration: PREREG_autocode.md (+ Amendment 1: retry on Jev `rate_limit_error`, checkpoint/resume; infrastructure only).
216 holdout actor-cases (1990-2021), none skipped. Coder input: ICB summary cut to Background + Pre-crisis + trigger paragraph.
Paid Jev for the completed run: USD 0.064 (the crashed first run used some more; both under the USD 0.50 cap).

## Field agreement with ICB coders
| Field | Agreement | Majority-class baseline |
|---|---|---|
| Trigger | **0.57** | 0.38 |
| Issue | 0.70 | **0.81** |
| Conflict setting | 0.57 | 0.57 |
| Geography | **0.75** | 0.49 |
| Power side | **0.70** | 0.48 |
| Attacker regime / age / territory / nuclear / alliances | 0.59 / **0.72** / **0.65** / 0.59 / **0.67** | 0.54 / 0.19 / 0.38 / 0.61 / 0.43 |
| Defender regime / age / territory / nuclear / alliances | **0.70** / **0.73** / **0.69** / 0.67 / **0.59** | 0.36 / 0.23 / 0.42 / 0.67 / 0.33 |
| Defender decision group (n = 87) | 0.39 | **0.52** |

Clearly above the baseline on 11 of 16 fields; at or below it on issue, setting, both nuclear fields and decision group.
Exploratory look at the misses: for "issue" the coder often picks political-diplomatic where ICB says military-security (40 of 173
military-security cases); for "trigger" ICB's political acts are often read as "other non-violent act" (16) and non-violent military acts as
violent acts (10).

## Downstream (v2 probability from the codes)
| Codes used | holdout log-lik | Brier |
|---|---|---|
| ICB coders | **-87.29** | 0.1256 |
| Auto-coded | -89.90 | 0.1274 |
| Base rate (no model) | -89.25 | 0.1226 |
Mean absolute difference between the two probabilities: 0.107.

Pass rule (auto-coded log-lik > base rate): **not met** (-89.90 vs -89.25). Simple mode stays "not validated".

## What it means for the app
- The validated number assumes the codes are right. With auto-codes, the estimate is on average about 11 points away from the one ICB's
  coders would produce, and over 216 crises it is no better than the base rate. Simple mode is a fast draft, not a validated estimate.
- The UI already shows every auto-code with its confidence and an "edit in full mode" button; the note now states this result.
- The largest gap is on the crisis-level codes (issue, trigger, setting), not on the country profiles. Better prompting for those three
  questions, or asking the user to confirm them, is the obvious next step and would need a new pre-registration.
