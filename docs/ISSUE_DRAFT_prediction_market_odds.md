<!-- Draft for github.com/telegraphprotocol/bounties (template: capability-demand / app-gap). Not posted yet. -->

# [App gap] No Intent returns live prediction-market odds for a named question (blocks Conflict Intelligence / mission 05)

**Mission:** 05 Conflict Intelligence (also useful for 13 Asset Management, 14 Web3 Native & DeFi)
**Network:** testnet (devnode), checked 2026-11-20

## What the app needs
Given a free-text geopolitical question (e.g. "Will China blockade Taiwan in 2026?"), return the current implied probability of the
best-matching open prediction market, with market id, venue, volume/liquidity and timestamp, so an agent can show a crowd signal next to
its own model estimate.

## What exists today (and why it does not cover this)
- `EVENT_OUTCOME_RESOLUTION_GENERAL` (39 miners) resolves **settled** events; open markets come back `unresolved`
  (e.g. Daemon row for "Will Putin be out as Russia's president by end of 2026?": `verdict: unresolved`).
- Registered Polymarket / Kalshi wrappers (`Polymarket Active Markets` 59002, `Polymarket Series` 59005, `Kalshi Market Result` 29302)
  take only `limit` / `active` / a fixed `ticker`; they cannot search by question, and each has served at most 1 request.
- The Daemon feed `collector-polymarket:high_volume_market` publishes market **questions** but no price or probability field.

## Suggested shape
Intent `PREDICTION_MARKET_ODDS` — params `{ query: string }` (or `{ venue, market_id }`); result fields
`market_title, venue, market_id, yes_probability (0-1), volume_usd, liquidity_usd, as_of, url`. Evaluation can compare against the venue's
public API price at `as_of` (deterministic, cheap to score).

## Evidence
App: Escalation Ledger (H2, mission 05) — buys `NEWS_SEARCH_GENERAL` via x402 and would buy this Intent on every assessment.
