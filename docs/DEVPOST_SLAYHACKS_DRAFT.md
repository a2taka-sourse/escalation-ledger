<!--
NOTE FOR THE AUTHOR (not part of the submission):
- Telegraph H2 rules as fetched on 2026-11-20 (hackathon.telegraphprotocol.com/rules) contain NO clause forbidding submitting the same
  project to another hackathon such as Devpost. Relevant lines: you may submit to more than one H2 track if each entry is a real, distinct
  contribution; you may reuse your own code and must disclose major reused components; "We won't pay twice for the same result" applies to
  Telegraph's own December challenges; "copied work presented as independent" can disqualify. The official prize-payment terms were NOT
  reviewed.
- SLAY HACKS' own rules (submission period, whether pre-existing projects are allowed, themes, judging criteria) were NOT checked.
  Confirm them before submitting. If SLAY HACKS requires work started during its own period, this draft must not be used as is.
- The text below discloses the Telegraph H2 entry to stay honest with both organisers.
-->

# Escalation Ledger

**Tagline:** The probability that a crisis ends in full-scale war, with a receipt for every piece of intelligence the agent bought.

## Inspiration
Analysts asked "how bad can this crisis get?" either answer slowly with no audit trail, or point to a prediction market that may not
exist for that question. Meanwhile AI agents are starting to pay for information per request. I wanted to see whether an agent could buy
the intelligence it needs, reason with an established theory of war (Fearon's bargaining model: commitment problems, misperception,
indivisible stakes), and show both its answer and its receipts — and whether that answer survives a fair test on real history.

The engine started life in a fictional-world simulation I had built, where a game-theory "war judgment" correctly predicted eight unseen
wars of an invented history. The obvious question was whether it would work on the real world.

## What it does
- You describe a crisis between two states (trigger, issue, conflict setting, regimes, nuclear status, alliances, power balance).
- The agent codes it into the same anonymised format as 533 historical crises, asks a judgement model (Jev) to score ten bargaining-theory
  factors, and returns a **validated probability of full-scale war** with the factors that drove it.
- It then **buys recent news** on the Telegraph network (pay-per-request over x402, testnet USDC), lets the judge re-read the situation,
  and reports what the news changes **only as a direction and level** (for example "up, large"), because news is not what the model was
  validated on.
- Every purchase comes with a **receipt**: a Telegraph signal hash anyone can verify, the on-chain settlement transaction, the miner, the
  price and the latency.
- Live demo: https://escalation-ledger.onrender.com · Code: https://github.com/a2taka-sourse/escalation-ledger

## How we built it
- **Node.js** server and a single-page UI; **x402** payments with `@x402/fetch` and `viem` on Base Sepolia; Telegraph's
  `NEWS_SEARCH_GENERAL` intent; signal verification through Telegraph's public signal endpoint.
- **Jev** (TypeSafe's evaluation model, via OpenCode Zen) answers ten fixed questions on a 0-4 scale, three runs per case.
- **Validation in Python** on the International Crisis Behavior dataset v16: crises up to 1989 for fitting, 1990-2021 held out, with the
  test design and data hashed (SHA-256) before any model was fitted.
- **Spending guard**: every paid call reserves budget first; daily and total caps; Upstash Redis keeps the ledger on free hosting (Render).
- Parity tests: the app's situation text matches the training text for all 749 cases, and its probabilities match the Python model to
  1.7e-16.

## Challenges we ran into
- **The original engine failed.** Ported to real crises, the game-theory model collapsed to about 42 % war for every case and scored worse
  than the base rate. I recorded the failure instead of tuning it on the test set.
- The rebuilt layer (logistic regression on the judge's factor scores plus power balance) **passed its pre-registered test only
  narrowly** (holdout log-likelihood -87.29 vs base rate -89.25 and power-only -87.88) and is still worse than power-only on Brier score and
  AUC. The data hint at one reason: after 1989, far fewer ICB cases were coded from documents or memoirs (8 % vs 40 % in 1918-45).
- **Paying per request has sharp edges on testnet**: a timed-out request was still charged, a fallback answer was billed while reporting a
  cost of 0, a settlement failed once at the facilitator, and the judge model's free tier ran out mid-study. Each became a guard rail in
  the code.
- Adding real, named news to an anonymised model moves the answer a lot (+44 and +61 points in two runs), so I chose to show the
  direction, not a number.

## Accomplishments that we're proud of
- An agent that makes autonomous, verifiable purchases and shows the receipts, end to end, on a public URL.
- A validation that was written down before it was run, including the part that failed.
- Total real money spent on the whole project: about USD 0.12 of judge-model calls; everything else ran on testnet tokens and free tiers.

## What we learned
- A model that passes on an invented history can fail on the real one; pre-registration is what makes that visible.
- Within 1918-1989 the bargaining factors clearly help; out of time their gain is small. Honest uncertainty is a product feature.
- For agent payments, trust the settlement, not the reported cost, and budget before every call.

## What's next for Escalation Ledger
- Blend "street-level" event data (for example UCDP or GDELT) judged blind by the same model, under a new pre-registration.
- Crowd signals from prediction markets once the network offers them (an issue describing the gap is drafted).
- Recalibration on crises after 2021, authentication for the hosted API, and mainnet payments when available.

*Also submitted to Telegraph Hackathon Season II (Apps & Agents, mission 05).*

**Built with:** node.js, javascript, x402, viem, telegraph, python, numpy, scipy, render, upstash-redis
