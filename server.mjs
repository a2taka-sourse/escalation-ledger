// Minimal HTTP server: static UI + JSON API. `node server.mjs` (PORT, default 8787).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { assess, InputError, BudgetError, VALIDATION } from "./src/pipeline.mjs";
import { Budget } from "./src/budget.mjs";
import { MODEL_INFO } from "./src/model.mjs";
import * as C from "./src/codes.mjs";
import { payerAddress } from "./src/telegraph.mjs";

const budget = new Budget();
const PORT = Number(process.env.PORT || 8787);
let busy = 0;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);

const send = (res, code, obj, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(obj, null, 1) : obj);
};

async function body(req, limit = 20000) {
  let s = "";
  for await (const ch of req) { s += ch; if (s.length > limit) throw new InputError("body too large"); }
  try { return JSON.parse(s || "{}"); } catch { throw new InputError("invalid JSON"); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, readFileSync("public/index.html", "utf8"), "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/api/options") {
      const { TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU, POWER, GEO } = C;
      return send(res, 200, { TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU, POWER: Object.keys(POWER), GEO: Object.keys(GEO) });
    }
    if (req.method === "GET" && url.pathname === "/api/status")
      return send(res, 200, { budget: await budget.status(), model: MODEL_INFO, validation: VALIDATION, payer: payerAddress() });
    if (req.method === "POST" && url.pathname === "/api/assess") {
      if (busy >= MAX_CONCURRENT) return send(res, 429, { error: "busy, try again in a minute" });
      busy++;
      try { return send(res, 200, await assess(await body(req), { budget })); } finally { busy--; }
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    if (e instanceof InputError) return send(res, 400, { error: e.message });
    if (e instanceof BudgetError) return send(res, 429, { error: e.message, kind: e.kind });
    console.error(e);
    return send(res, 502, { error: "upstream failure", detail: String(e.message).slice(0, 300) });
  }
}).listen(PORT, () => console.log(`escalation app on http://localhost:${PORT}`));
