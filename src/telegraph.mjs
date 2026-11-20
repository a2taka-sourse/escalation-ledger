// Telegraph purchase over x402 (Base Sepolia test USDC; payer pays no gas). Budget-guarded, one retry on facilitator settlement errors.
import { readFileSync, existsSync } from "node:fs";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

export const NODE = process.env.TELEGRAPH_NODE || "https://devnode.telegraphprotocol.com";
// Payment network and asset come from configuration (mainnet readiness). Known testnet assets are built in; any other network
// must name its asset explicitly, otherwise the app refuses to start paying.
const KNOWN_ASSETS = { "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" }; // Circle test USDC, Base Sepolia
export const NETWORK = process.env.TELEGRAPH_PAY_NETWORK || "eip155:84532";
const USDC = process.env.TELEGRAPH_PAY_ASSET || KNOWN_ASSETS[NETWORK];
if (!/^eip155:\d+$/.test(NETWORK) || !/^0x[0-9a-fA-F]{40}$/.test(USDC || "")) {
  throw new Error(`unsupported payment config: network=${NETWORK} asset=${USDC} (set TELEGRAPH_PAY_NETWORK and TELEGRAPH_PAY_ASSET)`);
}
const PRICE_CAP = process.env.TELEGRAPH_MAX_PER_CALL || "10000"; // atomic units; 0.01 USDC per purchase, refuse anything pricier

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

// Rail selection. "escrow" (default): Ethereum Sepolia Diamond, multi-miner ranked ask, on the protocol ledger, failed calls never billed.
// "x402": Base Sepolia exact, one miner, settled per call (payments stay off the Diamond's books). Escrow falls back to x402 if unusable.
export const RAIL = process.env.TELEGRAPH_RAIL || "escrow";
const MAX_BUDGET_UUSDC = Number(process.env.TELEGRAPH_MAX_BUDGET_UUSDC || 30000); // multi-miner ask budget, $0.03

/** Buys one intent. Returns { ok, result, receipt } or { ok:false, error, receipt } — never throws on network/payment failure. */
export async function buyIntent(intent, params, { budget, timeoutMs = 60000 } = {}) {
  if (RAIL === "escrow") {
    const { askEscrow } = await import("./escrow.mjs");
    await budget.reserve("telegraph", MAX_BUDGET_UUSDC / 1e6);
    const t0 = Date.now();
    const r = await askEscrow({ intent, params, max_budget_usdc: MAX_BUDGET_UUSDC }, { timeoutMs });
    if (r.charged_uusdc > 0) await budget.settle("telegraph", r.charged_uusdc / 1e6);
    const a = r.answer || {};
    const receipt = {
      rail: "escrow", intent, params, http: r.status ?? null, latency_ms: Date.now() - t0, network: r.network ?? null,
      payer: r.payer ?? null, diamond: r.diamond ?? null, authorized_usdc: Number(r.authorized_uusdc || 0) / 1e6,
      charged_usdc: r.charged_uusdc / 1e6,
      signal_hash: a.signal_hash ?? null, verify_url: a.signal_hash ? `${NODE}/engine/v1/signal/${a.signal_hash}` : null,
      miners: (r.receipts || []).map(x => ({ miner: x.miner ?? x.miner_id ?? null, intent: x.intent ?? intent, usdc: Number(x.amount_uusdc ?? 0) / 1e6,
        receipt_hash: x.receipt_hash ?? null, epoch_id: x.epoch_id ?? null })),
      ledger_proof_urls: r.proof_urls || [],
      settlement_tx: null, // escrow settles in the epoch ledger root, not per request
    };
    if (r.ok) return { ok: true, result: a.result ?? null, answer: a, receipt };
    // unusable escrow (no option, or balance) -> fall back to the x402 rail; anything else is a real failure (and was not billed)
    if (/no escrow option|insufficient escrow/i.test(r.error || "")) {
      const fb = await buyIntentX402(intent, params, { budget, timeoutMs });
      fb.receipt.fallback_from_escrow = r.error;
      return fb;
    }
    return { ok: false, error: r.error, receipt };
  }
  return buyIntentX402(intent, params, { budget, timeoutMs });
}

export async function buyIntentX402(intent, params, { budget, timeoutMs = 45000 } = {}) {
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
    rail: "x402", intent, params, http: res.status, latency_ms: Date.now() - t0, retried,
    miner: res.body?.miner_name ?? res.body?.miner_id ?? null, cost_usd: res.body?.cost_usd ?? null,
    signal_hash: res.body?.signal_hash ?? null, verify_url: res.body?.signal_hash ? `${NODE}/engine/v1/signal/${res.body.signal_hash}` : null,
    settlement_tx: res.settlement?.transaction ?? null, payer: res.settlement?.payer ?? null, network: NETWORK,
  };
  if (res.settlement?.success) await budget.settle("telegraph", 0.01); // charged even when the miner then fails (documented)
  if (res.status !== 200) return { ok: false, error: res.body?.error || res.body?.raw || `HTTP ${res.status}`, receipt };
  return { ok: true, result: res.body.result, receipt };
}
