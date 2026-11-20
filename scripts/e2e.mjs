// End-to-end: buy news on Telegraph (x402) -> outcome-blind situation text -> Jev x3 -> Fearon/QRE game.
// Prints escalation probabilities with and without the purchased intelligence, and writes a full receipt.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { askJev, summarize, MODEL } from "../src/jev.mjs";
import { solveGame, jevToGame, NEUTRAL, FROZEN } from "../src/game.mjs";
import { Budget } from "../src/budget.mjs";

const budget = new Budget();
await budget.startRun();

const NODE = "https://devnode.telegraphprotocol.com";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e", NETWORK = "eip155:84532";

// Case: static world numbers are NOT purchased; labelled as assumptions.
const CASE = {
  id: "cn-tw-2026-11",
  attacker: "People's Republic of China", defender: "Taiwan (ROC)", contested: "Taiwan",
  news_query: "China Taiwan military tension",
  world: { era: "e5", kind: "war", popA: 1.41e9, popD: 2.34e7, popT: 2.34e7, distA_km: 500, distD_km: 0, roughT: 0.6, wetT: 0.0 },
  world_sources: "populations: UN WPP 2024 approx; distA = 180 km strait crossing inflated for sea transport (assumption); roughT = share of mountainous terrain (approx.)",
};

const key = readFileSync(".env", "utf8").match(/EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)[1];
const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(privateKeyToAccount(key)) }],
  spendControls: { allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: "10000" }] },
});

// 1. buy intelligence
let t0 = Date.now();
await budget.reserve("telegraph", 0.01);
const buy = () => pay(`${NODE}/engine/v1/ask`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ intent: "NEWS_SEARCH_GENERAL", params: { query: CASE.news_query } }),
});
let r = await buy();
let news = await r.json();
if (r.status === 402 && /settle/i.test(JSON.stringify(news))) { // facilitator hiccup seen on 2026-11-20: retry once
  console.log("   settlement failed at the facilitator, retrying once");
  r = await buy(); news = await r.json();
}
if (r.status === 200) await budget.settle("telegraph", Number(news.cost_usd || 0.01));
const payResp = (() => { try { return JSON.parse(Buffer.from(r.headers.get("payment-response") || "", "base64").toString()); } catch { return null; } })();
const purchase = { intent: "NEWS_SEARCH_GENERAL", http: r.status, latency_ms: Date.now() - t0, miner: news.miner_name || news.miner_id, cost_usd: news.cost_usd, signal_hash: news.signal_hash, settlement_tx: payResp?.transaction, payer: payResp?.payer };
console.log("1) bought news:", purchase.http, `${purchase.latency_ms}ms`, purchase.miner, "$" + purchase.cost_usd, purchase.signal_hash?.slice(0, 18));
mkdirSync("receipts", { recursive: true });
writeFileSync(`receipts/purchase-${CASE.id}-${Date.now()}.json`, JSON.stringify({ purchase, news }, null, 2)); // keep the receipt even if a later step fails
if (r.status !== 200 || !news.result?.answer) throw new Error("news purchase failed: " + JSON.stringify(news).slice(0, 300));

// 2. outcome-blind situation text (same principle as 下腦: never tell Jev what happened)
const state = {
  situation: `Potential conflict. Attacker: ${CASE.attacker}. Defender: ${CASE.defender}. Contested: ${CASE.contested}.`,
  recent_news: news.result.answer,
  note: "No outcome is given. Judge only from the situation described.",
};

// 3. Jev x3 (stability check, as in the frozen model)
const runs = [];
for (let i = 0; i < 3; i++) {
  const j = await askJev(state, { budget });
  runs.push(j);
  console.log(`2) Jev run ${i + 1}: ${j.latency_ms}ms $${j.cost_usd.toFixed(6)}`, j.model, Object.fromEntries(Object.entries(j.answers).map(([k, v]) => [k, v.score ?? Number(v.noul ?? v.probability).toFixed(2)])));
}
const jev = summarize(runs);

// 4. solve the game with and without the purchased intelligence
const withIntel = solveGame(CASE.world, jevToGame(jev.scores, jev.generic, jev.coh));
const neutral = solveGame(CASE.world, NEUTRAL);
const pct = x => (100 * x).toFixed(1) + "%";
console.log("3) game (frozen v04 lambda=%s Lambda=%skm)", FROZEN.lam.toFixed(2), FROZEN.Lam.toFixed(0));
console.log("   with purchased news : war", pct(withIntel.war), "| concession", pct(withIntel.concession), "| status quo", pct(withIntel.status_quo), "| attacker win-prob", pct(withIntel.p_win_A));
console.log("   neutral (no intel)  : war", pct(neutral.war), "| concession", pct(neutral.concession), "| status quo", pct(neutral.status_quo));
console.log("   Jev spread (max-min over 3 runs):", jev.spread, "| generic-circumstance prob", jev.generic.toFixed(2));

const cost = { telegraph_usd: Number(news.cost_usd || 0), jev_usd: runs.reduce((a, b) => a + b.cost_usd, 0) };
mkdirSync("receipts", { recursive: true });
const file = `receipts/e2e-${CASE.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ case: CASE, purchase, news_result: news.result, state, jev: { model: MODEL, runs, summary: jev }, game: { frozen: FROZEN, with_intel: withIntel, neutral }, cost }, null, 2));
console.log("4) cost: Telegraph $%s + Jev $%s | saved %s", cost.telegraph_usd, cost.jev_usd.toFixed(6), file);
