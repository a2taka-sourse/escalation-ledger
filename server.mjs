// Minimal HTTP server: static UI + JSON API. `node server.mjs` (PORT, default 8787).
// Every response carries an X-Request-Id; every request writes one JSON log line (no secrets, no request body).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { assess, InputError, BudgetError, VALIDATION } from "./src/pipeline.mjs";
import { Budget } from "./src/budget.mjs";
import { MODEL_INFO } from "./src/model.mjs";
import * as C from "./src/codes.mjs";
import { payerAddress, NETWORK } from "./src/telegraph.mjs";

const budget = new Budget();
const PORT = Number(process.env.PORT || 8787);
let busy = 0;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);

// Per-client sliding-window rate limit for paid assessments (in memory; resets on restart).
// Known limit: keyed on the first X-Forwarded-For entry, which a client can set; daily spending caps remain the real backstop.
const RATE_PER_HOUR = Number(process.env.RATE_PER_CLIENT_PER_HOUR || 6);
const hits = new Map();
function clientId(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}
function rateOk(req) {
  const id = clientId(req), now = Date.now(), win = 3600_000;
  const recent = (hits.get(id) || []).filter(t => now - t < win);
  if (recent.length >= RATE_PER_HOUR) { hits.set(id, recent); return false; }
  recent.push(now); hits.set(id, recent);
  if (hits.size > 10000) hits.clear(); // bound memory
  return true;
}

function log(entry) { console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry })); }

async function body(req, limit = 20000) {
  let s = "";
  for await (const ch of req) { s += ch; if (s.length > limit) throw new InputError("body too large"); }
  try { return JSON.parse(s || "{}"); } catch { throw new InputError("invalid JSON"); }
}

createServer(async (req, res) => {
  const id = randomUUID(), t0 = Date.now(), url = new URL(req.url, "http://x");
  const meta = {};
  const send = (code, obj, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Request-Id": id });
    res.end(type === "application/json" ? JSON.stringify(obj, null, 1) : obj);
    log({ id, method: req.method, path: url.pathname, status: code, ms: Date.now() - t0, ...meta });
  };
  try {
    if (req.method === "GET" && url.pathname === "/") return send(200, readFileSync("public/index.html", "utf8"), "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/api/options") {
      const { TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU, POWER, GEO } = C;
      return send(200, { TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU, POWER: Object.keys(POWER), GEO: Object.keys(GEO) });
    }
    if (req.method === "GET" && url.pathname === "/api/status")
      return send(200, { budget: await budget.status(), model: MODEL_INFO, validation: VALIDATION, payer: payerAddress(), payment_network: NETWORK });
    if (req.method === "POST" && url.pathname === "/api/assess") {
      if (!rateOk(req)) { meta.kind = "rate"; return send(429, { error: `rate limit: ${RATE_PER_HOUR} assessments per hour per client`, kind: "rate", request_id: id }); }
      if (busy >= MAX_CONCURRENT) { meta.kind = "busy"; return send(429, { error: "busy, try again in a minute", kind: "busy", request_id: id }); }
      busy++;
      try {
        const out = await assess(await body(req), { budget, requestId: id });
        Object.assign(meta, { signal_hash: out.telegraph_purchase?.signal_hash, settlement_tx: out.telegraph_purchase?.settlement_tx,
          jev_cached: out.base?.jev_cached, news: out.news_adjusted?.shift ? `${out.news_adjusted.shift.direction}/${out.news_adjusted.shift.level}` : "unavailable" });
        return send(200, out);
      } finally { busy--; }
    }
    return send(404, { error: "not found", request_id: id });
  } catch (e) {
    if (e instanceof InputError) { meta.kind = "input"; return send(400, { error: e.message, request_id: id }); }
    if (e instanceof BudgetError) { meta.kind = e.kind; return send(429, { error: e.message, kind: e.kind, request_id: id }); }
    meta.kind = "upstream"; meta.detail = String(e.message).slice(0, 200);
    return send(502, { error: "upstream failure", detail: String(e.message).slice(0, 300), request_id: id });
  }
}).listen(PORT, () => log({ msg: `escalation app on http://localhost:${PORT}`, payment_network: NETWORK }));
