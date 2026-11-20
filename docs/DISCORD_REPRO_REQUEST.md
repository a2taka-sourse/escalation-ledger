# Discord message: ask builders to reproduce a Telegraph purchase (for the Telegraph Discord, H2 / builders channel)

Goal: an independent developer actually reproduces a Telegraph request or tests the integration and leaves feedback (H2 rubric:
"evidence that an independent developer acted on the work", 2 pts + 2 pts for further contribution). Rules: no incentives for
stars/likes, no engagement exchange, disclose that this is an H2 entry. Ask for a concrete, small action and make feedback easy.

---

Hi all — I built **Escalation Ledger** for H2 (mission 05, Conflict Intelligence; this is my hackathon entry).

It buys `NEWS_SEARCH_GENERAL` over x402 on Base Sepolia, scores 10 bargaining-theory factors with a judgement model, and returns
P(full-scale war) plus a receipt (signal_hash + settlement tx).

Looking for 1-2 builders to try one of these and tell me what broke:
1. **2 min, no setup:** open https://escalation-ledger.onrender.com, run a preset, click the signal_hash in the receipt and check that
   `/engine/v1/signal/{hash}` shows the same intent and payer.
2. **10 min, local:** `git clone https://github.com/a2taka-sourse/escalation-ledger`, `npm install`, `node scripts/new-wallet.mjs`,
   fund it from faucet.circle.com (Base Sepolia, free), `node scripts/probe-buy.mjs`. That buys 6 intents and writes receipts; you'll see
   which intents work for you today.

Feedback as a GitHub issue on the repo (or a reply here) is perfect, including "it didn't work". The validation write-up, including
the part that failed, is in `validation/icb/`. Thanks!

---

Notes for whoever posts:
- Keep the GitHub issue / reply links: they are the evidence for the H2 form.
- If someone reproduces it, thank them and ask if it's OK to cite their issue/reply in the submission.
