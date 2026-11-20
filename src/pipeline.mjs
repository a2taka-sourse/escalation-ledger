// One assessment = (1) validated base probability from the coded situation, (2) news-adjusted probability using intelligence bought
// on Telegraph (labelled unvalidated), with every purchase's receipt.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildState, TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU, POWER, GEO } from "./codes.mjs";
import { askJev } from "./jev.mjs";
import { features, predict, MODEL_INFO } from "./model.mjs";
import { buyIntent } from "./telegraph.mjs";
import { Budget, BudgetError } from "./budget.mjs";
import { benchmark } from "./views.mjs";

export const VALIDATION = {
  summary: "Probability layer = L2 logistic on Jev's 10 Fearon-style items + power balance, trained on 533 ICB v16 crises (1918-1989), " +
    "tested out-of-time on 216 crises (1990-2021). Pre-registered pass: beats base rate and power-only on log-likelihood (-87.29 vs -89.25 / -87.88). " +
    "Margin over power-only is small and it does not beat power-only on Brier/AUC; the top-quartile predictions over-estimate war (0.37 vs 0.20). " +
    "ICB is hand-coded by researchers from mostly English sources; post-1989 cases rest on thinner sources (8% use documents/memoirs vs 40% in 1918-45) and coverage is uneven by region. " +
    "It answers: given a crisis, will it reach full-scale war?",
  report: "validation/icb/RESULT_v2.md",
};

export class InputError extends Error {}

const pick = (obj, v, name) => { if (!(String(v) in obj)) throw new InputError(`invalid ${name}: ${v}`); return String(v); };
const side = (s, name, withSize) => s == null ? null : {
  regime: pick(REGIME, s.regime, `${name}.regime`), age: pick(AGE, s.age, `${name}.age`), territ: pick(TERRIT, s.territ, `${name}.territ`),
  nuclear: pick(NUCLEAR, s.nuclear, `${name}.nuclear`), allycap: pick(ALLY, s.allycap, `${name}.allycap`),
  ...(withSize && s.sizedu != null ? { sizedu: pick(SIZEDU, s.sizedu, `${name}.sizedu`) } : {}),
};

export function normalise(input) {
  if (!input || typeof input !== "object") throw new InputError("body must be a JSON object");
  const names = { attacker: String(input.attacker_name || "").slice(0, 80).trim(), defender: String(input.defender_name || "").slice(0, 80).trim() };
  if (!names.attacker || !names.defender) throw new InputError("attacker_name and defender_name are required");
  if (!(input.power in POWER)) throw new InputError(`invalid power: ${input.power}`);
  if (!(input.geo in GEO)) throw new InputError(`invalid geo: ${input.geo}`);
  const iso = v => { if (v == null || v === "") return null; const s = String(v).toUpperCase(); if (!/^[A-Z]{3}$/.test(s)) throw new InputError(`invalid ISO-3 code: ${v}`); return s; };
  return {
    names, iso: { attacker: iso(input.attacker_iso), defender: iso(input.defender_iso) },
    news_query: String(input.news_query || `${names.attacker} ${names.defender} military tension`).slice(0, 160),
    coded: {
      year: 2026, triggr: pick(TRIGGR, input.triggr, "triggr"), issue: pick(ISSUE, input.issue, "issue"), pc: pick(PC, input.pc, "pc"),
      geo: input.geo, powdis: POWER[input.power],
      attacker: side(input.attacker ?? null, "attacker", false), defender: side(input.defender, "defender", true),
    },
  };
}

// Identical situation text -> identical Jev answers and zero cost (in-memory, 24 h). The 3 runs per state are still separate calls.
const JEV_CACHE_MS = 24 * 3600_000;
const jevCache = new Map();
export const stateHash = state => createHash("sha256").update(JSON.stringify(state)).digest("hex");

async function jevRuns(state, budget, n = 3) {
  const key = stateHash(state);
  const hit = jevCache.get(key);
  if (hit && Date.now() - hit.at < JEV_CACHE_MS) return { ...hit.value, cost_usd: 0, cached: true, state_sha256: key };
  const runs = await Promise.all(Array.from({ length: n }, () => askJev(state, { budget })));
  const spread = {};
  for (const k of ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10"]) {
    const v = runs.map(r => Number(r.answers[k].score)); spread[k] = Number((Math.max(...v) - Math.min(...v)).toFixed(2));
  }
  const value = { runs, spread, cost_usd: runs.reduce((a, r) => a + r.cost_usd, 0), models: [...new Set(runs.map(r => r.model))] };
  jevCache.set(key, { at: Date.now(), value });
  if (jevCache.size > 500) jevCache.delete(jevCache.keys().next().value);
  return { ...value, cached: false, state_sha256: key };
}

export async function assess(input, { budget = new Budget(), saveDir = "receipts/runs", requestId = null } = {}) {
  const t0 = Date.now();
  const { names, iso, news_query, coded } = normalise(input);
  await budget.startRun();
  const viewsP = (iso.attacker || iso.defender) ? benchmark(iso.attacker, iso.defender) : Promise.resolve(null); // runs in parallel, never throws

  // (1) validated base estimate: exactly the training format, no names, no news
  const baseState = buildState(coded);
  const baseJev = await jevRuns(baseState, budget);
  const base = predict(features(baseJev.runs, coded.powdis));

  // (2) news-adjusted estimate: same text + intelligence bought on Telegraph
  const purchase = await buyIntent("NEWS_SEARCH_GENERAL", { query: news_query }, { budget });
  let adjusted = null;
  if (purchase.ok && purchase.result?.answer) {
    const newsState = { ...baseState, recent_news: String(purchase.result.answer).slice(0, 4000),
      note: "Country names and years are withheld in the coded part. Recent news about the real parties is appended. No outcome is given." };
    const newsJev = await jevRuns(newsState, budget);
    const adj = predict(features(newsJev.runs, coded.powdis));
    const delta = adj.p_war - base.p_war;
    adjusted = {
      validated: false,
      shift: classifyShift(delta),                       // what the UI shows: direction + level only
      moved_by: movedFactors(base.contributions, adj.contributions),
      sources: purchase.result.sources ?? null,
      jev_spread: newsJev.spread, jev_models: newsJev.models, jev_cost_usd: newsJev.cost_usd,
      raw: { p_war: adj.p_war, delta_vs_base: delta, contributions: adj.contributions,
        note: "Unvalidated: named, recent news is a different input distribution from the anonymised training text. Not a forecast." },
    };
  }

  const views = await viewsP;
  const out = {
    request_id: requestId, parties: names, generated_at: new Date().toISOString(), latency_ms: Date.now() - t0,
    base: { p_war: base.p_war, contributions: base.contributions, jev_spread: baseJev.spread, jev_models: baseJev.models,
      jev_cost_usd: baseJev.cost_usd, jev_cached: baseJev.cached, state_sha256: baseJev.state_sha256, validated: true, state: baseState },
    external_benchmark: views,
    news_adjusted: adjusted ?? { unavailable: true, reason: purchase.error || "no news answer", validated: false },
    telegraph_purchase: purchase.receipt,
    cost: { telegraph_test_usdc: purchase.receipt.settlement_tx ? 0.01 : 0, jev_usd: baseJev.cost_usd + (adjusted?.jev_cost_usd || 0) },
    model: MODEL_INFO, validation: VALIDATION,
    disclaimer: "Research prototype on Telegraph testnet. Not a forecast service; probabilities are model outputs with the limits stated in `validation`.",
  };
  if (saveDir) {
    mkdirSync(saveDir, { recursive: true });
    writeFileSync(`${saveDir}/${out.generated_at.replace(/[:.]/g, "-")}.json`, JSON.stringify({ input, ...out }, null, 2));
  }
  return out;
}

/** News effect shown as direction + level only (thresholds in probability points, fixed 2026-11-20). */
export const SHIFT_LEVELS = [[3, "negligible"], [10, "small"], [25, "moderate"], [Infinity, "large"]];
export function classifyShift(delta) {
  const pts = Math.abs(delta) * 100;
  const level = SHIFT_LEVELS.find(([lim]) => pts < lim)[1];
  return { direction: level === "negligible" ? "none" : delta > 0 ? "up" : "down", level,
    bands_pts: "negligible <3, small 3-10, moderate 10-25, large >=25" };
}

/** factors whose log-odds contribution changed most between base and news runs */
export function movedFactors(baseC, adjC, n = 3) {
  const b = Object.fromEntries(baseC.map(c => [c.feature, c]));
  return adjC.map(c => ({ feature: c.feature, label: c.label, change: Number((c.contribution - (b[c.feature]?.contribution ?? 0)).toFixed(3)) }))
    .filter(c => c.feature !== "POWDIS50")
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change)).slice(0, n);
}

export { BudgetError };
