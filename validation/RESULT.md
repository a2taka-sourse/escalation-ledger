# Jev swap re-validation (2026-11-20) - REPLICATED

Question: does Jev served by OpenCode Zen (`jev-1.13-free`) reproduce the September frozen-holdout result obtained with Vercel `typesafe-ai/jev`?
Protocol: identical to `ngcm_war_v04.py` (same code, questions, outcome-blind states, 19 events x 3 runs; fit on 11 training events, freeze, predict 8 unseen events without refitting). Only the Jev endpoint changed (boolean -> noul). Output: `out/90_inverse/east_20260920/war/v04_zen/`.

## Unseen 8 events (log-likelihood, higher is better)
| Model | September (Vercel Jev) | November (Zen jev-1.13-free) |
|---|---|---|
| **Full model (frozen)** | **-7.01** | **-7.05** |
| Coin flip | -7.74 | -7.74 |
| No Jev (neutral weights) | -8.03 | -8.03 |
| No cost | -7.42 | -7.38 |
| No terrain | -8.83 | -8.77 |
| Power ratio only | -10.41 | -10.41 |

Drop-in check (September frozen variables + new Jev answers, no refit): -7.01. Per-event probabilities moved by at most 0.015.

## Training (11 events)
Fit -10.28 -> -10.24; leave-one-out total -13.34 -> -13.30 (coin flip -13.12).
Same two weak events as September: E04 (LOO 0.031) and E08 (0.093), already recorded as "contradiction detected" in the canon.

## Reading
- The holdout pass replicates: the full model beats every baseline on events it never saw, and Jev contributes ~1.0 nats over neutral weights.
- jev-1.13-free behaves like the September Jev on this task (answers differ in the second decimal).
- Honest limitation: leave-one-out on the 11 training events is still no better than a coin flip; the pass rests on the frozen 8-event holdout.
