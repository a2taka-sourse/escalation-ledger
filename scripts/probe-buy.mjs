// Day-1 kill test: buy each Conflict-Intelligence input once with x402 on Base Sepolia (test USDC, gasless for us).
// Saves one receipt per call to receipts/day1-<timestamp>.json. Hard cap: MAX_CALLS x $0.01.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

const NODE = "https://devnode.telegraphprotocol.com";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Circle test USDC, Base Sepolia
const NETWORK = "eip155:84532";
const PER_CALL_CAP = "10000"; // 0.01 USDC (6 decimals) - refuse anything pricier
const MAX_CALLS = 6;

const key = readFileSync(".env", "utf8").match(/EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)[1];
const account = privateKeyToAccount(key);

const chain = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
const bal = await chain.readContract({ address: USDC, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [account.address] });
console.log("wallet", account.address, "test USDC", Number(bal) / 1e6);
if (bal < 10000n) {
  console.log("no test USDC yet - get it from https://faucet.circle.com (Base Sepolia)");
  process.exitCode = 1;
  await new Promise(() => setTimeout(() => process.kill(process.pid), 50)); // exit cleanly on Windows
}

const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
  spendControls: { allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: PER_CALL_CAP }] },
});

const PROBES = [
  { intent: "NEWS_SEARCH_GENERAL", params: { query: "Taiwan Strait military tension" } },
  { intent: "FACT_CHECK_GENERAL", params: { claim: "China held large-scale military drills around Taiwan in 2026" } },
  { intent: "MACRO_ECONOMIC_INDICATOR_GENERAL", params: { indicator: "unemployment rate", country: "China", year: 2024 } },
  { intent: "LIVE_PORT_CONGESTION_GENERAL", params: { port: "Kaohsiung" } },
  { intent: "VESSEL_TELEMETRY_VERIFY_GENERAL", query: "Is commercial vessel traffic through the Taiwan Strait currently normal?" },
  { intent: "QUESTION_ANSWERING_GENERAL", query: "What are the main drivers of military escalation risk between China and Taiwan right now?" },
].slice(0, MAX_CALLS);

mkdirSync("receipts", { recursive: true });
const out = [];
for (const p of PROBES) {
  const t0 = Date.now();
  let rec = { intent: p.intent, request: p, network: NETWORK };
  try {
    const r = await pay(`${NODE}/engine/v1/ask`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
    });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
    rec = { ...rec, http: r.status, latency_ms: Date.now() - t0, payment_response: r.headers.get("payment-response") || r.headers.get("x-payment-response"), body };
  } catch (e) {
    rec = { ...rec, error: String(e?.message || e), latency_ms: Date.now() - t0 };
  }
  out.push(rec);
  const b = rec.body || {};
  console.log(
    p.intent.padEnd(34), rec.http ?? "ERR", `${rec.latency_ms}ms`,
    "| miner", b.miner_id ?? b.miner_slug ?? "-", "| cost", b.cost_usd ?? "-",
    "| hash", (b.signal_hash || "-").slice(0, 18),
    "|", JSON.stringify(b.result ?? b.error ?? rec.error ?? b).slice(0, 220),
  );
}
const file = `receipts/day1-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
const after = await chain.readContract({ address: USDC, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [account.address] });
console.log("saved", file, "| test USDC after", Number(after) / 1e6);
