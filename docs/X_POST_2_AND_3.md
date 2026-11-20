# X updates #2 (11/25) and #3 (11/29) — for Muse to post from @as5hy

Rules followed: tag @Telegraphprotoc in the first post of each thread, disclose hackathon participation and cash prizes, link official
material / the working app, no engagement bait, no bought or traded engagement. All numbers below come from saved runs and result files
(receipts/, README.md, validation/icb/RESULT_v1.md, RESULT_v2.md). Do not round or change them.
Character counts were checked by hand with URLs counted as 23; each post is meant to stay under 280. Re-check in the X composer before posting.

Save the URL of every post: they are the evidence for "three updates on separate dates" in the H2 form.

---

## Update #2 — 11/25: the receipts and how to try it (thread of 4)

**2-1**

Update 2 on Escalation Ledger (@Telegraphprotoc H2, mission 05): the receipts.

One hosted run (Russia -> Ukraine): base P(full-scale war) 30.3%, news shift up/large. The news cost 0.01 test USDC via x402 on Base Sepolia; the whole run took 21.8 s.

**2-2**

Every purchase is checkable by anyone:
signal_hash 0xeb4d5f80... -> GET /engine/v1/signal/{hash} returns the intent, the miner and the paying wallet.
Settlement tx 0x4479bb00... is on Base Sepolia.
Try it (testnet, first load ~1 min): https://escalation-ledger.onrender.com

**2-3**

Lessons from paying per call: a failed request on Base Sepolia is still charged (documented), and an LLM-fallback answer was billed while cost_usd said 0.

So the app reserves budget before every purchase, caps spend per day and retries a settlement error once.

**2-4**

Run it yourself in ~10 min: clone, npm install, make a throwaway testnet wallet, get free test USDC (faucet.circle.com), node scripts/probe-buy.mjs.
Code: https://github.com/a2taka-sourse/escalation-ledger
Hackathon entry with cash prizes; "it broke" reports welcome.

Optional image for 2-2: the receipt block of the result screen (signal_hash and tx visible). Never show `.env` or keys.

---

## Update #3 — 11/29: what testing on real crises taught me (thread of 5)

**3-1**

Update 3 (@Telegraphprotoc H2, mission 05): what testing on real crises taught me.

I pre-registered the test before fitting: train on 533 ICB crises up to 1989, predict 216 from 1990-2021 without refitting.

**3-2**

v1, game theory ported from my fictional-world sim: failed. Rational-choice precision collapsed (lambda 7.7 -> 0.046) and it said ~42% war for every crisis, worse than the base rate.
Lesson: a model that passed on an invented history did not transfer.

**3-3**

v2, logistic layer on the judge model's 10 factor scores + power balance: passed, narrowly. Holdout log-likelihood -87.29 vs base rate -89.25 and power-only -87.88. But power-only wins on Brier and AUC. Before 1990 the factors help clearly.

**3-4**

Why weaker after 1990? A plausible reason: ICB coders had documents or memoirs for 40% of 1918-45 cases, 8% after 1989.
So the app shows one validated number, and the news only as direction + level.
Write-up: https://github.com/a2taka-sourse/escalation-ledger

**3-5**

Disclosure: this is my Telegraph Hackathon Season II entry (cash prizes).
Try it: https://escalation-ledger.onrender.com
Next: a step-by-step tutorial on making your first paid Telegraph request from an agent.

---

## Notes for Muse
- If the tutorial is already published by 11/29, replace the last line of 3-5 with its link.
- Reply to genuine questions (H2 rubric: "technical discussion, answers, follow-up to feedback").
- If a developer says they reproduced it, ask whether we may cite their post or issue in the submission.
