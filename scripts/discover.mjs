// Free discovery: schema, miner count and the unpaid 402/422 answer for each Conflict-Intelligence input.
// Writes discovery/<intent>.json. Nothing here spends money.
import { mkdirSync, writeFileSync } from "node:fs";

const NODE = "https://devnode.telegraphprotocol.com";
const INTENTS = [
  "NEWS_SEARCH_GENERAL",
  "FACT_CHECK_GENERAL",
  "WEB_SEARCH_GENERAL",
  "MACRO_ECONOMIC_INDICATOR_GENERAL",
  "SANCTIONS_SCREENING_MATCH_GENERAL",
  "VESSEL_TELEMETRY_VERIFY_GENERAL",
  "LIVE_PORT_CONGESTION_GENERAL",
  "EVENT_OUTCOME_RESOLUTION_GENERAL",
  "QUESTION_ANSWERING_GENERAL",
];

const get = async (url, init) => {
  const r = await fetch(url, init);
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
  return { status: r.status, body };
};

mkdirSync("discovery", { recursive: true });
for (const intent of INTENTS) {
  const schema = await get(`${NODE}/engine/v1/intents/${intent}`);
  const miners = await get(`${NODE}/engine/v1/intents/${intent}/miners`);
  // unpaid ask with only a query: tells us whether the node can fill params and what it costs
  const unpaid = await get(`${NODE}/engine/v1/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, query: "Is there a risk of military escalation in the Taiwan Strait this month?" }),
  });
  writeFileSync(`discovery/${intent}.json`, JSON.stringify({ intent, schema, miners, unpaid }, null, 2));
  const mc = Array.isArray(miners.body) ? miners.body.length : (miners.body?.miners?.length ?? miners.body?.count ?? "?");
  const params = schema.body?.request?.params ?? schema.body?.schemas?.request?.params ?? null;
  console.log(
    intent.padEnd(36),
    "schema", schema.status,
    "| miners", mc,
    "| unpaid ask", unpaid.status, unpaid.status === 402 ? unpaid.body?.accepts?.map(a => `${a.scheme}@${a.network}:${a.price}`).join(" ") : JSON.stringify(unpaid.body).slice(0, 160),
    "| params", params ? JSON.stringify(params).slice(0, 160) : "-",
  );
}
