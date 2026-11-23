# Upstream issues for github.com/telegraphprotocol/bounties (drafts, field by field for the repo's issue forms)

All evidence is from my own testnet traffic (wallet 0xf8e5a5382dbf48cdf6bdfe41ed6c52ed4dbac089) on 2026-11-20/21 and is public-safe.
Each issue ends with the same disclosure line.

Disclosure line: *Found while building Escalation Ledger, my Telegraph Hackathon Season II entry (Apps & Agents, mission 05; the hackathon has cash prizes). Repo: https://github.com/a2taka-sourse/escalation-ledger*

---

## 1. Template "Protocol / tooling gap" — Area: Documentation
**Title:** [Protocol/Tooling] Publish the leaf encoding of the epoch deliveries tree so callers can verify their Merkle proof

**What useful work is harder or impossible because of this?**
`GET /v1/blocks/{epoch}/deliveries/{receipt_hash}` returns a delivery row, a Merkle `proof` and the block's `deliveries_root`, and the docs say a
paying caller "can prove their call was billed". But the leaf encoding and the hash/pairing rule are not documented, so a client cannot
recompute `deliveries_root` from its own receipt and the proof. Today an app can only trust the node's statement that the row is in the block.

**Reproduction / evidence**
- `GET https://devnode.telegraphprotocol.com/v1/blocks/26/deliveries/0x050afcf916f3e96d9faccd69e4c9a8289813d3c07f6d4d82e08f2dfe44e7a989`
  returns `deliveries_root 0xc36b6f133bc2cd87ba130e2bb0a09ee2c010c727b332ad9c5dcb8c971dc9cdc2` and an 8-step proof.
- I tried leaf = receipt_hash, keccak256(receipt_hash), sha256(receipt_hash), keccak256(abi.encodePacked(receipt_hash, payer, miner_id, intent, usdc)),
  keccak256(abi.encode(receipt_hash, payer, usdc)); pairing sorted, left-ordered and right-ordered; with keccak256 and sha256. None reproduces the root.

**Acceptance criteria**
The docs (escrow-inference.md or how-it-works.md) state the leaf encoding, hash function and pairing/ordering rule, plus one worked example that
reproduces a real `deliveries_root` from a receipt and its proof.

---

## 2. Template "Protocol / tooling gap" — Area: Reliability / performance
**Title:** [Protocol/Tooling] Escrow deposit shows as `available` on /v1/ledger/account but asks are refused with `balance=0` until a later ledger root

**What useful work is harder or impossible because of this?**
After `depositUSDC`, `/v1/ledger/account/{addr}` immediately reports the deposit as `available`, so a client concludes it can spend. Signed
escrow asks are still refused with `insufficient escrow ... > balance=0` until a later ledger root (between 45 minutes and 1 hour in my case). Apps cannot tell when a fresh
deposit becomes spendable and either fail or fall back to another rail.

**Reproduction / evidence**
- Deposit tx (Ethereum Sepolia): `0x625c24a17297098258882f0ed7db6331d40421a93fa527dcc7ab351e22c7e47d` (5 test USDC), confirmed before 17:49 UTC on 2026-11-20.
- Right after: `/v1/ledger/account/0xf8e5...c089` -> `deposited 5000000, available 5000000, active_root.epoch_id 24` (cutoff 13:05:36 UTC).
- Signed escrow asks (intent NEWS_SEARCH_GENERAL, `max_budget_usdc` 30000) at 17:49, 17:49 and 17:50 UTC -> HTTP 402
  `insufficient escrow for delivery: unbilled=0 μUSDC + price=30000 μUSDC > balance=0 μUSDC`.
- 18:35 UTC, `active_root.epoch_id` 25 (cutoff 18:06 UTC) -> the same ask succeeds (receipt `0x050afcf916f3e96d9faccd69e4c9a8289813d3c07f6d4d82e08f2dfe44e7a989`, epoch 26).
- The epoch-24 root (cutoff 13:05 UTC) was still the active root at 17:50 UTC.

**Acceptance criteria**
Either the ask path counts on-chain deposits the same way /v1/ledger/account does, or /v1/ledger/account exposes the amount the ask path will
accept (e.g. `spendable_now`) and the docs state when a deposit becomes spendable.

---

## 3. Template "Protocol / tooling gap" — Area: Observability
**Title:** [Protocol/Tooling] x402 answers served by the LLM fallback are settled on chain but report `cost_usd: 0`

**What useful work is harder or impossible because of this?**
An app that budgets from `cost_usd` under-counts spend: when no miner serves an intent, the engine answers from a generic LLM
(`miner_id: "openai"`), reports `cost_usd: 0`, but the x402 payment was settled.

**Reproduction / evidence** (x402 exact, Base Sepolia, 2026-11-20 12:16 UTC)
- VESSEL_TELEMETRY_VERIFY_GENERAL: signal `0x4967dc504451df4d4c74985ac128e472a7ea316694a10cc4a9cbccc3fe5085d1`, settlement tx
  `0x83fdab81a0fe050779c144a31ca2d08a591b9c19aec39de7d7cb30d68236e6b6`, body `cost_usd: 0`, `miner_id: "openai"`.
- QUESTION_ANSWERING_GENERAL: signal `0x97aa8125fe3d899a636f3dc425168ef1e50285b5c75afee3e838d77ec9d35fa7`, tx
  `0x0871ed6006febdb6ab27da86a76c5f99b911f2815089488c86b315576f745566`, `cost_usd: 0`.
- Both payments settled (`payment-response.success: true`, payer my wallet).

**Acceptance criteria**
`cost_usd` reflects what was charged (or the response carries a separate `charged_usdc`), and the response flags fallback answers explicitly
(e.g. `served_by: "fallback"`), so callers can refuse or account for them.

---

## 4. Template "App / Agent integration gap"
**Title:** [App] FACT_CHECK_GENERAL returns a schema-shaped empty verdict (claim/reasoning/sources null) and is billed

**App / mission / integration:** Escalation Ledger, mission 05 Conflict Intelligence

**What is supposed to work?** An agent buys a fact check of a public claim before using it in an assessment and gets a verdict with reasoning
and sources.

**What blocks it?** The served answer is `{"claim": null, "verdict": "Unverified", "reasoning": null, "sources": null}` with HTTP 200 and a settled
payment, so the call cannot be distinguished from a real "unverified" verdict.

**Public-safe evidence / reproduction**
- Request `{"intent":"FACT_CHECK_GENERAL","params":{"claim":"China held large-scale military drills around Taiwan in 2026"}}`, miner 4433,
  signal `0x92d479164dcb6c0a88b176d8d7626aa0e6a43b848e160d629a5d1064cad6e9ee`, tx `0x3e2117cc000919f92b888a8e95f73393ee5225f02650e82a534079bdcc082d5f`,
  `cost_usd 0.01`, 2026-11-20 12:16 UTC.

**What observable result would make the App unblocked?** A FACT_CHECK answer with non-null reasoning and sources for a public claim, or a
non-2xx / unbilled response when the miner cannot check it; and evaluation for this Intent that fails empty verdicts.

---

## 5. Template "Public-safe missing capability / customer need"
**Title:** [Capability] Live prediction-market odds for a named question

**Public-safe outcome or missing capability**
Given a free-text question (e.g. "Will China blockade Taiwan in 2026?"), return the current implied probability of the best-matching open
prediction market with venue, market id, volume/liquidity and timestamp, so an agent can show a crowd signal next to its own estimate.

**Related existing Intent (if known):** EVENT_OUTCOME_RESOLUTION_GENERAL (resolves settled events only)

**Publicly shareable evidence**
- EVENT_OUTCOME_RESOLUTION_GENERAL answers open markets with `verdict: unresolved` (e.g. Daemon row "Will Putin be out as Russia's president by
  end of 2026?").
- Registered Polymarket/Kalshi wrappers (59002 Polymarket Active Markets, 59005 Polymarket Series, 29302 Kalshi Market Result) accept only
  `limit` / `active` / a fixed `ticker` and cannot search by question.
- The Daemon `collector-polymarket:high_volume_market` feed publishes market questions without a price field.

**Safe observable outcome / acceptance outline**
An Intent (e.g. PREDICTION_MARKET_ODDS, params `{query}` or `{venue, market_id}`) whose answer includes `yes_probability`, `market_id`, `venue`,
`as_of`, and an evaluation that compares it with the venue's public price at `as_of`.
