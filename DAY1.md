# Day 1 (2026-11-20) - kill test passed

Mission: **05 Conflict Intelligence** (escalation score whose every input is traceable to a purchase and its price).
Core engine to reuse: `ngcm_war_game.py` from the private 下腦 world-simulation project (Fearon bargaining + QRE, Jev quantifies weights).

## Setup
- Throwaway testnet wallet `0xF8E5A5382DbF48cDF6Bdfe41ED6c52ED4DBAC089` (key only in local `.env`, not mirrored).
- 20 test USDC from faucet.circle.com (Base Sepolia). Real money spent: 0.
- Pay rail: x402 `exact` on Base Sepolia (`eip155:84532`), gasless for the payer.

## Result of 6 paid calls ($0.06 test USDC, receipts in `receipts/day1-*.json`)
| Intent | HTTP | Time | Outcome |
|---|---|---|---|
| NEWS_SEARCH | 200 | 24.0s | Usable: real recent articles with sources (miner chainsight-oracle) |
| FACT_CHECK | 200 | 7.6s | **Empty**: verdict "Unverified", claim/reasoning/sources null |
| MACRO_ECONOMIC_INDICATOR | 200 | 14.7s | Usable but typed form only supports unemployment rate (China 2024 = 4.59%) |
| LIVE_PORT_CONGESTION | 500 | 59.8s | **Failed** ("no time left in the request's budget"), **still charged** $0.01 |
| VESSEL_TELEMETRY_VERIFY | 200 | 2.7s | **No miner**: fell back to a generic LLM ("I do not have access to live data"), cost_usd reported 0 but **charged** $0.01 |
| QUESTION_ANSWERING | 200 | 3.3s | Same LLM fallback, cost_usd 0 but charged |

Every call has an on-chain x402 settlement (`payment-response` header, payer = our wallet) and
`GET /engine/v1/signal/{hash}` returns our wallet as payer -> Inspect requirement is satisfiable.

## Findings worth reporting (honest-limitations content / possible bounty issues)
1. Base Sepolia payments for failed requests are not refunded (documented), port congestion timed out after 60s.
2. LLM fallback answers are billed while `cost_usd` says 0 -> accounting mismatch.
3. FACT_CHECK returned a schema-shaped empty verdict.

## Decision for the build
- Situation text for Jev: NEWS_SEARCH (works). Drop FACT_CHECK/VESSEL/PORT from the critical path; keep them as optional inputs that the app must survive failing ("Break it").
- Economic size: macro typed form is unemployment only -> use local static data (World Bank GDP/military spend) and label it as non-purchased.

## End-to-end (2026-11-20 evening) - PASSED
- Jev: Vercel AI Gateway `typesafe-ai/jev` now returns 403 for free-tier credits. Switched to **OpenCode Zen `/v1/systemone`, model `jev-1.13-free`** (TypeSafe-native schema: boolean type is `noul`, answer field `noul`). Billing source "free", cost 0, ~270 ms/call. Fallback `jev-1.13` only on rate/quota limit.
- Game solver ported to `src/game.mjs`; parity with Python `solve_game` = 0.00 difference on war and rebellion cases. Frozen v04 parameters (lambda 7.71, Lambda 1157 km).
- Run `scripts/e2e.mjs` (China -> Taiwan): news bought on Telegraph ($0.01 test USDC, 4.7 s, signal_hash 0x87afffce...), Jev x3 (max spread 0.13 on a 0-4 scale), game:
  war 4.7% / status quo 95.3% with purchased news vs war 3.2% / status quo 96.8% with neutral weights.
- One x402 settlement failed transiently ("invalid_exact_evm_transaction_failed", facilitator side); immediate retry succeeded. Retry logic needed in the app.
- Caveat: game parameters were calibrated on fictional pre-modern history (下腦). Real-world calibration (e.g. ICB crisis data holdout) is still to do; the jev-1.13 model also differs from the September Vercel Jev used for the frozen holdout.
