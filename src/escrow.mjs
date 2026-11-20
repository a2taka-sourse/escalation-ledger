// Telegraph escrow rail (Ethereum Sepolia Diamond): deposit once, then every call is authorised with an EIP-191 signature and charged
// in the epoch's ledger root. Failed requests are never billed. A multi-miner ask (max_budget_usdc) lets Telegraph route to several
// ranked miners and bills one row per used answer. Docs: telegraph-docs/using/escrow-inference.md.
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";

export const NODE = process.env.TELEGRAPH_NODE || "https://devnode.telegraphprotocol.com";

function account() {
  let key = process.env.EVM_PRIVATE_KEY;
  if (!key && existsSync(".env")) key = readFileSync(".env", "utf8").match(/EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)?.[1];
  if (!key) throw new Error("EVM_PRIVATE_KEY not configured");
  return privateKeyToAccount(key);
}

const b64json = h => { try { return h ? JSON.parse(Buffer.from(h, "base64").toString()) : null; } catch { return null; } };

/**
 * body: { intent, params } or { query }, plus max_budget_usdc (uUSDC). Returns { ok, status, answer, receipts[], first_receipt, error }.
 * Never throws on payment/network failure.
 */
export async function askEscrow(body, { timeoutMs = 60000 } = {}) {
  const acct = account();
  const json = { "Content-Type": "application/json" };
  const raw = JSON.stringify(body);
  let challenge;
  try {
    challenge = await fetch(`${NODE}/engine/v1/ask`, { method: "POST", headers: json, body: raw, signal: AbortSignal.timeout(20000) }).then(r => r.json());
  } catch (e) { return { ok: false, error: `challenge: ${e.message}` }; }
  const escrow = challenge?.accepts?.find(a => a.scheme === "escrow");
  if (!escrow) return { ok: false, error: `no escrow option in challenge: ${JSON.stringify(challenge).slice(0, 200)}` };

  const template = escrow.extra.message;
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: acct.address.toLowerCase(),                 // the node lowercases before checking the signature
    to: escrow.payTo,
    value: template.match(/Amount:\s*(\d+)\s*uUSDC/)[1],
    validAfter: String(now - 5),
    validBefore: String(now + 100),                   // window must stay under 2 minutes
    nonce: randomUUID(),                              // fresh every attempt; never reuse
  };
  const message = template.replace("{from}", authorization.from).replace("{nonce}", authorization.nonce)
    .replace("{validAfter}", authorization.validAfter).replace("{validBefore}", authorization.validBefore);
  const signature = await acct.signMessage({ message });
  const payment = Buffer.from(JSON.stringify({ x402Version: 2, scheme: "escrow", network: escrow.network, payload: { signature, authorization } })).toString("base64");

  const t0 = Date.now();
  let res, answer;
  try {
    res = await fetch(`${NODE}/engine/v1/ask`, { method: "POST", headers: { ...json, "X-PAYMENT": payment }, body: raw, signal: AbortSignal.timeout(timeoutMs) });
    answer = await res.json().catch(() => null);
  } catch (e) { return { ok: false, error: `ask: ${e.message}`, authorized_uusdc: authorization.value }; }
  const first = b64json(res.headers.get("x-payment-response"));
  const rows = answer?.fulfillment?.payments ?? (first ? [first] : []);
  const out = {
    ok: res.status === 200, status: res.status, latency_ms: Date.now() - t0, answer,
    authorized_uusdc: authorization.value, network: escrow.network, diamond: escrow.payTo, payer: acct.address,
    first_receipt: first, receipts: rows,
    charged_uusdc: rows.reduce((a, r) => a + Number(r.amount_uusdc ?? r.amount ?? 0), 0),
    proof_urls: rows.filter(r => r.epoch_id != null && r.receipt_hash).map(r => `${NODE}/v1/blocks/${r.epoch_id}/deliveries/${r.receipt_hash}`),
  };
  if (!out.ok) out.error = answer?.reason || answer?.error || `HTTP ${res.status}`;   // a failed request is never billed
  return out;
}
