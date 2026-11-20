# H2 submission draft — Escalation Ledger (Apps & Agents)

Status: draft 2026-11-20. Fields marked TODO need a decision or a link that does not exist yet.

## 1. Project details
- Team / contact: Individual (registered contact) — TODO confirm on the form
- Track: Apps & Agents
- Project name: Escalation Ledger
- Mission: 05 Conflict Intelligence
- Working / reviewer-access link: https://escalation-ledger.onrender.com (repo: https://github.com/a2taka-sourse/escalation-ledger — TODO confirm after Muse pushes)
- GitHub username that starred telegraphprotocol/bounties: `a2taka-sourse`

## 2. Short demo (2-5 min) — TODO record
Flow: problem → coded crisis input → Telegraph purchase (402 → x402 settlement) → receipt and `/engine/v1/signal/{hash}` check →
validated base estimate vs what the news changes (direction + level) → why (factor contributions) → failure case (bad input 400; purchase failure keeps base) → how to try.

## 3. How to run it
See README.md: prerequisites (Node 20+, OpenCode Zen key, Base Sepolia test USDC), `npm install`, `node scripts/new-wallet.mjs`,
`node server.mjs`, sample `curl`, expected result, network (Telegraph devnode, x402 on Base Sepolia), costs (0.01 test USDC + ~USD 0.00034
Jev per assessment), caps, known limitations.

## 4. Evidence
- Paid Telegraph requests with settlement transactions: `receipts/day1-*.json` (6 intents), `receipts/e2e-*.json`, `receipts/runs/*.json`.
  Example: signal_hash `0x929cf99cfe04fa1e4a422843a77bd8bea74e4275a1b046d12e1b8d61ca3df72f`, tx `0x11ca7886372d1483eb319dcee867bdd561fef14a30acedad9d23a2316da6b586`.
- Pre-registrations with SHA-256: `validation/icb/PREREG.md` (+Amendment 1), `PREREG_v2.md`; results `RESULT_v1.md` (fail), `RESULT_v2.md` (pass, narrow).
- Jev continuity check (September vs November judge, 8 unseen fictional-history events): `validation/RESULT.md`.
- Tests: `scripts/test-budget.mjs` (4/4), `scripts/test-parity.mjs` (text 749/749, model max diff 1.7e-16).
- Network findings: `DAY1.md`, `docs/ISSUE_DRAFT_prediction_market_odds.md`.

## 5. Short public summary
Escalation Ledger is an agent for mission 05 (Conflict Intelligence). For a crisis between two states it buys recent news on Telegraph
(x402, testnet), has a judgement model score ten bargaining-theory factors, and returns the probability of full-scale war twice: a base
estimate validated out of time on 216 real crises (1990-2021, pre-registered, narrow pass) and what the news changes, shown only as a direction
and level with the factors it moved, clearly labelled as not validated. Every purchase comes with its signal hash and settlement transaction. The first design, a game-theory engine
from a fictional-world project, failed its pre-registered test and the write-up says why. Try it: README.md. Updates: TODO links to X posts.

## 6. Showcase permission — TODO (your call)
Suggested: allow text, screenshots, demo video and tutorial; buyer introductions yes/no?

## Commercial summary (five questions)
1. **Who is it for?** Risk and research desks that must say something about a geopolitical crisis within hours: macro and commodities
   funds, insurers' political-risk teams, corporate security and supply-chain teams. ICB records 512 international crises in 1918-2021 (about 5 a
   year, 1,131 crisis actors), and each triggers many repeated "how bad can this get" checks while it lasts.
2. **What does it improve?** Today the options are analyst judgement (slow, unpriced, not auditable) or prediction markets (fast, but
   only where a market exists and with no reasoning attached). This gives a number in ~30 s for any pair of states, with its reasoning
   decomposed into named factors, a published track record on 216 out-of-time crises, and a priced, verifiable receipt for every input.
   It is not more accurate than a simple power-balance model out of time; its value is speed, audit trail and the factor breakdown.
3. **What does it do today?** Working end to end on the Telegraph testnet: x402 purchase of `NEWS_SEARCH_GENERAL` (0.01 test USDC,
   ~5-25 s), Jev scoring x6 (~0.3-0.5 s each, free or USD 0.0000572), frozen v2 probability layer, receipts, spending caps, failure handling.
   Measured end-to-end latency 21.5 s. Testnet only; no customer usage yet.
4. **Why would someone adopt it?** Each estimate costs well under one cent and comes with evidence a compliance or investment committee
   can inspect. Before production: mainnet payments, a hosted deployment with authentication, coverage for crises that are not
   state-vs-state, recalibration on post-2021 crises, and a validated way to use news (today it is shown, not trusted).
5. **How can someone try it?** Clone, `npm install`, get Base Sepolia test USDC from the Circle faucet and an OpenCode Zen key, run
   `node server.mjs`, open localhost:8787 and pick a preset. Maintained by the author (individual).
