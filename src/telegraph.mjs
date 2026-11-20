// Telegraph purchase over x402 (Base Sepolia test USDC; payer pays no gas). Budget-guarded, one retry on facilitator settlement errors.
import { readFileSync, existsSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

export const NODE = process.env.TELEGRAPH_NODE || "https://devnode.telegraphprotocol.com";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e", NETWORK = "eip155:84532";
const PRICE_CAP = "10000"; // 0.01 USDC per purchase, refuse anything pricier

function walletKey() {
  if (process.env.EVM_PRIVATE_KEY) return process.env.EVM_PRIVATE_KEY;
  if (existsSync(".env")) { const m = readFileSync(".env", "utf8").match(/EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/); if (m) return m[1]; }
  throw new Error("EVM_PRIVATE_KEY not configured");
}

let payFetch = null;
function pay() {
  if (!payFetch) {
    payFetch = wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [{ network: NETWORK, client: new ExactEvmScheme(privateKeyToAccount(walletKey())) }],
      spendControls: { allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: PRICE_CAP }] },
    });
  }
  return payFetch;
}

export const payerAddress = () => privateKeyToAccount(walletKey()).address;

/** Buys one intent. Returns { ok, result, receipt } or { ok:false, error, receipt } — never throws on network/payment failure. */
export async function buyIntent(intent, params, { budget, timeoutMs = 45000 } = {}) {
  await budget.reserve("telegraph", 0.01); // BudgetError propagates: caller decides
  const t0 = Date.now();
  const once = async () => {
    const r = await pay()(`${NODE}/engine/v1/ask`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, params }), signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    let body; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
    let settlement = null;
    try { settlement = JSON.parse(Buffer.from(r.headers.get("payment-response") || "", "base64").toString()); } catch {}
    return { status: r.status, body, settlement };
  };
  let res, retried = false;
  try {
    res = await once();
    if (res.status === 402 && /settle/i.test(JSON.stringify(res.body))) { retried = true; res = await once(); }
  } catch (e) {
    return { ok: false, error: `network: ${e.message}`, receipt: { intent, params, latency_ms: Date.now() - t0 } };
  }
  const receipt = {
    intent, params, http: res.status, latency_ms: Date.now() - t0, retried,
    miner: res.body?.miner_name ?? res.body?.miner_id ?? null, cost_usd: res.body?.cost_usd ?? null,
    signal_hash: res.body?.signal_hash ?? null, verify_url: res.body?.signal_hash ? `${NODE}/engine/v1/signal/${res.body.signal_hash}` : null,
    settlement_tx: res.settlement?.transaction ?? null, payer: res.settlement?.payer ?? null, network: NETWORK,
  };
  if (res.settlement?.success) await budget.settle("telegraph", 0.01); // charged even when the miner then fails (documented)
  if (res.status !== 200) return { ok: false, error: res.body?.error || res.body?.raw || `HTTP ${res.status}`, receipt };
  return { ok: true, result: res.body.result, receipt };
}
