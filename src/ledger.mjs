// Check that an escrow purchase is recorded in the node's epoch ledger block.
// GET {NODE}/v1/blocks/{epoch}/deliveries/{receipt_hash} returns the delivery row, a Merkle proof and the block's deliveries_root
// (404 until the epoch's block is recorded; up to about an hour on testnet, sometimes longer).
// Limitation: the leaf encoding of the deliveries tree is not published, so this app cannot re-derive deliveries_root from the proof.
// It checks the node-served row against what we paid for (payer, intent, amount, receipt hash) and shows the roots for anyone to inspect.
import { NODE } from "./escrow.mjs";

export async function checkDelivery(epoch, receiptHash, expect = {}) {
  if (!/^\d{1,9}$/.test(String(epoch)) || !/^0x[0-9a-fA-F]{64}$/.test(String(receiptHash))) return { status: "error", error: "bad epoch or receipt hash" };
  const url = `${NODE}/v1/blocks/${epoch}/deliveries/${receiptHash}`;
  let r, j;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "escalation-ledger/0.1" } });
    j = await r.json().catch(() => null);
  } catch (e) { return { status: "error", error: e.message, url }; }
  if (r.status === 404) return { status: "pending", url, note: j?.error || "epoch block not recorded yet" };
  if (!r.ok || !j?.delivery) return { status: "error", error: `HTTP ${r.status}`, url };
  const d = j.delivery, problems = [];
  if (d.receipt_hash?.toLowerCase() !== receiptHash.toLowerCase()) problems.push("receipt_hash");
  if (expect.payer && d.payer?.toLowerCase() !== expect.payer.toLowerCase()) problems.push("payer");
  if (expect.intent && d.intent !== expect.intent) problems.push("intent");
  if (expect.usdc != null && Number(d.usdc) !== Math.round(Number(expect.usdc) * 1e6)) problems.push("amount");
  return {
    status: problems.length ? "mismatch" : "recorded", problems, url, epoch_id: j.epoch_id,
    delivery: d, deliveries_root: j.deliveries_root, block_data_root: j.block_data_root, protocol_state_root: j.protocol_state_root,
    proof_length: (j.proof || []).length,
    note: "Row found in the node's epoch block and it matches the purchase. The Merkle leaf format is not published, so the proof is shown but not re-derived locally.",
  };
}
