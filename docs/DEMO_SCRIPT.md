# Demo video script (target 3:30, max 5:00) — screen recording + voice-over or captions

Rule from H2: show the real input, the result, and the Telegraph integration. Screen recording is fine.

| # | Time | Screen | Say / caption |
|---|---|---|---|
| 1 | 0:00-0:20 | README top / title | "Escalation Ledger, mission 05 Conflict Intelligence. Given a crisis between two states it returns the probability of full-scale war, and a receipt for every piece of intelligence it bought." |
| 2 | 0:20-0:45 | Terminal: `curl` the ask endpoint without payment → `402 Payment Required` | "Every Telegraph request is paid. Without payment the node answers 402 with the price: one cent, testnet USDC." |
| 3 | 0:45-1:30 | Live site, preset China → Taiwan, press Assess, wait | "The agent codes the crisis, buys recent news on Telegraph over x402, and asks Jev, a judgement model, to score ten bargaining-theory factors." |
| 4 | 1:30-2:10 | Result: base probability card + "why" bars | "This number is the only one we trust: a model validated out of time on 216 real crises. The bars show which factors drove it." |
| 5 | 2:10-2:40 | News card: arrow + level + moved factors | "The news changes Jev's reading, here strongly upward. We show only the direction: news is not what the model was validated on." |
| 6 | 2:40-3:10 | Click signal_hash → `/engine/v1/signal/...` JSON; click tx → Base Sepolia explorer | "Every purchase can be checked: the signal hash ties request and answer together, and the settlement transaction is on chain." |
| 7 | 3:10-3:30 | Break it: bad input → 400; mention purchase failure keeps base | "Bad input is refused before any money moves. If the purchase fails, you still get the base estimate." |
| 8 | 3:30-4:10 | `validation/icb/RESULT_v1.md` and `RESULT_v2.md` | "Honest part: my first engine, game theory from a fictional-world simulation, failed its pre-registered test. The rebuilt layer passes narrowly and is still not better than power balance on every metric." |
| 9 | 4:10-4:30 | README Quick start | "Try it at escalation-ledger.onrender.com, or run it locally in ten minutes. Testnet only, no real money." |

Recording tips: record the Assess run once beforehand so the server is warm (free hosting sleeps after 15 minutes). Keep the terminal
font large. Do not show `.env` or any key.
