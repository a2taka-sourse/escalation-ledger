---
title: "Your agent's first paid purchase on Telegraph (x402, testnet) — and how to keep it honest"
tags: [telegraph, x402, agents, javascript]
note: Draft for dev.to (English). A Zenn (Japanese) version can be made from this. Disclosure line at the end is required.
---

AI agents increasingly need to *buy* things: a data point, a verification, a model answer. [Telegraph](https://docs.telegraphprotocol.com)
is a network where an agent pays per request and gets a receipt it can prove. In this tutorial you will make your first paid Telegraph
request from Node.js in about 10 minutes, verify it, and add the guard rails you need before letting an agent spend on its own.
Everything runs on testnet with free test tokens. No real money.

I built this while making [Escalation Ledger](https://github.com/a2taka-sourse/escalation-ledger), an agent for Telegraph Hackathon
Season II mission 05 (Conflict Intelligence). The code below is taken from that repository.

## What you need
- Node.js 20+
- A browser for the Circle faucet
- 10 minutes

```bash
mkdir tg-first-buy && cd tg-first-buy && npm init -y && npm pkg set type=module
npm install @x402/fetch @x402/evm viem
```

## 1. A throwaway testnet wallet
Never use a key that holds real funds. Generate one and keep it in `.env` (and in `.gitignore`).

```js
// new-wallet.mjs
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "node:fs";
const key = generatePrivateKey();
writeFileSync(".env", `# TESTNET ONLY\nEVM_PRIVATE_KEY=${key}\n`, { mode: 0o600 });
console.log("address:", privateKeyToAccount(key).address);
```

## 2. Free test USDC (no ETH needed)
Open <https://faucet.circle.com>, choose **Base Sepolia**, paste your address. Telegraph accepts Circle's test USDC on Base Sepolia
(`0x036CbD53842c5426634e7929541eC2318f3dCF7e`). With the x402 `exact` scheme your wallet only **signs**; the facilitator settles on chain,
so you do not need ETH for gas.

## 3. Look before you pay (free)
Discovery endpoints cost nothing:

```bash
curl https://devnode.telegraphprotocol.com/engine/v1/intents                       # canonical intents + miner counts
curl https://devnode.telegraphprotocol.com/engine/v1/intents/NEWS_SEARCH_GENERAL   # params and result fields
```

Then ask without paying. A `402 Payment Required` is the expected answer: it is the price list.

```bash
curl -X POST https://devnode.telegraphprotocol.com/engine/v1/ask \
  -H "Content-Type: application/json" \
  -d '{"intent":"NEWS_SEARCH_GENERAL","params":{"query":"China Taiwan military tension"}}'
```

When I ran this, the body listed three ways to pay: `exact` on Base Sepolia (`eip155:84532`), `exact` on Solana devnet, and `escrow` on
Ethereum Sepolia, each at $0.01.

## 4. Pay with x402
`@x402/fetch` wraps `fetch`, reads the 402, signs the payment and retries. `spendControls` is your first guard rail: it refuses to pay
more than you allow per call.

```js
// buy.mjs
import { readFileSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const key = readFileSync(".env", "utf8").match(/EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)[1];
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e", NETWORK = "eip155:84532";

const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(privateKeyToAccount(key)) }],
  spendControls: { allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: "10000" }] }, // 0.01 USDC
});

const r = await pay("https://devnode.telegraphprotocol.com/engine/v1/ask", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ intent: "NEWS_SEARCH_GENERAL", params: { query: "China Taiwan military tension" } }),
});
const body = await r.json();
const settlement = JSON.parse(Buffer.from(r.headers.get("payment-response") || "", "base64").toString() || "null");
console.log(r.status, body.miner_name, body.cost_usd, body.signal_hash);
console.log("settled:", settlement?.transaction, "payer:", settlement?.payer);
console.log(body.result?.answer?.slice(0, 300));
```

## 5. Verify the receipt
Every paid call returns a `signal_hash`. Anyone can look it up:

```bash
curl https://devnode.telegraphprotocol.com/engine/v1/signal/<signal_hash>
```

It returns the signal, the payload the hash was computed over, and the paying wallet. The `payment-response` header gives you the
settlement transaction, which you can open in a Base Sepolia explorer. Store both: they are the only handles you have on a call later.

## 6. Guard rails before an agent spends on its own
What I learned paying for intelligence on testnet (2026-11-20):

| What happened | What to do |
|---|---|
| A request that timed out at the miner (60 s) was **still charged**. On Base Sepolia a failed request's payment is not moved to escrow (this is documented). | Reserve budget **before** each call and count it as spent once settlement succeeds, even if the answer fails. |
| An intent with no suitable miner fell back to a generic LLM answer; `cost_usd` said 0 but the call **was** billed. | Trust the settlement, not the reported cost. |
| One settlement failed at the facilitator (`invalid_exact_evm_transaction_failed`); an immediate retry succeeded. | Retry settlement errors once, then give up. |
| `FACT_CHECK_GENERAL` returned a schema-shaped empty verdict. | Validate the fields you need; treat empty results as failures. |
| Python's default `urllib` client got `403` from the signal endpoint while `curl` worked. | Send a proper `User-Agent` from scripts. |

A minimal budget guard (the version in the repo also stores the ledger in Redis for hosted deployments):

```js
async function guardedBuy(budget, intent, params) {
  await budget.reserve("telegraph", 0.01);          // throws if today's cap would be exceeded
  const res = await buyIntent(intent, params);       // the x402 call from step 4, with one retry on settlement errors
  if (res.settlement?.success) await budget.settle("telegraph", 0.01); // charged even if the miner failed
  return res;
}
```

## 7. Using what you bought — and checking it is worth anything
In Escalation Ledger the purchased news feeds a judgement model that scores ten bargaining-theory factors (commitment problems,
misperception, stakes...). Before trusting the output, I pre-registered a test on real data: fit on 533 historical crises up to 1989
(International Crisis Behavior v16), then predict 216 crises from 1990-2021 without refitting.

- My first engine, a game-theory model ported from a fictional-world simulation, **failed**: it predicted about 42 % war for every crisis
  and scored worse than the base rate.
- A simpler logistic layer on the factor scores plus power balance **passed narrowly** (log-likelihood -87.29 vs base rate -89.25 and
  power-only -87.88), but power-only is still better on Brier score and AUC.

So the app shows one validated probability and reports what the news changes only as a direction and level. If your agent buys
intelligence, decide in advance how you will know whether it helped, and write the failure down too.

## Try it
- Live demo (testnet; first load can take a minute): <https://escalation-ledger.onrender.com>
- Code and full write-up: <https://github.com/a2taka-sourse/escalation-ledger>
- Telegraph docs: <https://docs.telegraphprotocol.com> · Hackathon missions: <https://hackathon.telegraphprotocol.com/missions>

*Disclosure: this tutorial is part of my entry to Telegraph Hackathon Season II, which has cash prizes.*
