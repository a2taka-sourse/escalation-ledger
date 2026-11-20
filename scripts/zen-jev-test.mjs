// One-shot test: Jev via OpenCode Zen /v1/systemone (jev-1.13-free, fallback jev-1.13 only if the free model is limited).
// Key is read from ~/.local/share/opencode/auth.json and never printed.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { buildQuestions } from "../src/jev.mjs";

const key = JSON.parse(readFileSync(`${homedir()}/.local/share/opencode/auth.json`, "utf8")).opencode.key;
const ENDPOINT = "https://opencode.ai/zen/v1/systemone";

const state = {
  situation: "Potential conflict. Attacker: People's Republic of China. Defender: Taiwan (ROC). Contested: Taiwan.",
  recent_news: "Recent coverage from the last 30 days reports Chinese live-fire rocket drills near Taiwan (19 Nov 2026) and Taiwanese reports of PLA aircraft and vessels operating around the island.",
  note: "No outcome is given. Judge only from the situation described.",
};

async function call(model) {
  const t0 = Date.now();
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, state, questions: buildQuestions() }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 600); }
  return { model, http: r.status, latency_ms: Date.now() - t0, body };
}

const results = [await call("jev-1.13-free")];
const first = results[0];
const limited = first.http === 429 || first.http === 402 || /limit|quota|rate/i.test(JSON.stringify(first.body).slice(0, 400));
if (first.http !== 200 && limited) results.push(await call("jev-1.13"));

for (const r of results) {
  const a = r.body?.answers;
  console.log(r.model, "HTTP", r.http, `${r.latency_ms}ms`,
    a ? Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.score ?? Number(v.probability).toFixed(2)])) : JSON.stringify(r.body).slice(0, 400),
    "| usage", JSON.stringify(r.body?.usage ?? null), "| cost", JSON.stringify(r.body?.providerMetadata ?? r.body?.cost ?? null).slice(0, 120));
}
if (first.http !== 200 && !limited) console.log("free model failed for a non-limit reason -> no paid fallback attempted");
mkdirSync("receipts", { recursive: true });
writeFileSync(`receipts/zen-jev-test-${Date.now()}.json`, JSON.stringify(results, null, 2));
