// One assessment = (1) validated base probability from the coded situation, (2) news-adjusted probability using intelligence bought
// on Telegraph (labelled unvalidated), with every purchase's receipt.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { buildState, TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU, POWER, GEO } from "./codes.mjs";
import { askJev } from "./jev.mjs";
import { features, predictV3, MODEL_V3_INFO } from "./model.mjs";
import { rivalryFeatures } from "./rivalry.mjs";
import { buyIntent } from "./telegraph.mjs";
import { Budget, BudgetError } from "./budget.mjs";
import { benchmark } from "./views.mjs";
import { ucdpContext } from "./ucdp.mjs";

export const VALIDATION = {
  summary: "Probability layer v3 = ordinal logit on ICB violence levels using Jev's 10 Fearon-style items, power balance and the two states' past crisis record " +
    "(as-of, earlier years only), trained on 533 ICB v16 crises (1918-1989), tested out-of-time on 216 crises (1990-2021), pre-registered: " +
    "log-lik -81.84 vs v2 -87.29, power-only -87.88, base rate -89.25; Brier 0.118 and AUC 0.71 (best of all baselines). The gain over v2 is not " +
    "statistically certain (bootstrap 95% CI -2.9 to +13.3) and the holdout had been used before (disclosed). " +
    "ICB is hand-coded by researchers from mostly English sources; post-1989 cases rest on thinner sources (8% use documents/memoirs vs 40% in 1918-45) and coverage is uneven by region. " +
    "It answers: given a crisis, will it reach full-scale war?",
  report: "validation/icb/RESULT_v3.md",
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

// Simple mode: same news purchase reused for the same pair + topic for a few hours (receipt marked as reused).
const NEWS_CACHE_MS = Number(process.env.NEWS_CACHE_MINUTES || 180) * 60_000;
const newsCache = new Map();

export async function assessSimple(input, { budget = new Budget(), saveDir = "receipts/runs", requestId = null } = {}) {
  const t0 = Date.now();
  const clean = s => String(s || "").replace(/\s+/g, " ").trim();
  const attacker = clean(input.attacker_name).slice(0, 80), defender = clean(input.defender_name).slice(0, 80), topic = clean(input.topic).slice(0, 160);
  if (!attacker || !defender || !topic) throw new InputError("simple mode needs attacker_name, defender_name and topic");
  await budget.startRun();
  const key = `${attacker}|${defender}|${topic}`.toLowerCase();
  let purchase, reused = false;
  const hit = newsCache.get(key);
  if (hit && Date.now() - hit.at < NEWS_CACHE_MS) { purchase = hit.purchase; reused = true; }
  else {
    purchase = await buyIntent("NEWS_SEARCH_GENERAL", { query: `${attacker} ${defender} ${topic}` }, { budget });
    if (purchase.ok) { newsCache.set(key, { at: Date.now(), purchase }); if (newsCache.size > 300) newsCache.delete(newsCache.keys().next().value); }
  }
  if (!purchase.ok || !purchase.result?.answer) throw new UpstreamError(`news purchase failed: ${purchase.error || "no answer"}`);
  const { autoCode } = await import("./autocode.mjs");
  const coding = await autoCode({ attackerName: attacker, defenderName: defender, topic, newsText: purchase.result.answer }, { budget });
  const draft = { at: Date.now(), topic, purchase, reused, coding, iso: { attacker_iso: input.attacker_iso, defender_iso: input.defender_iso } };
  const draftId = randomUUID();
  drafts.set(draftId, draft);
  if (drafts.size > 500) drafts.delete(drafts.keys().next().value);
  // Step 1 of 2: return the draft codes. The fields auto-coding gets wrong most often must be confirmed before the estimate is computed.
  return {
    stage: "draft", draft_id: draftId, request_id: requestId, topic, latency_ms: Date.now() - t0,
    to_confirm: CONFIRM_FIELDS, codes: coding.input, confidence: coding.confidence,
    auto_coding: { validated: false, jev: coding.jev, note: AUTO_NOTE, report: "validation/icb/RESULT_autocode.md" },
    news: { answer: String(purchase.result.answer).slice(0, 1200), sources: purchase.result.sources ?? null },
    telegraph_purchase: { ...purchase.receipt, reused_from_cache: reused },
  };
}

// Step 2 of 2: the user confirms (or changes) trigger, issue and setting; everything else may also be overridden. No new purchase.
export async function confirmSimple(input, { budget = new Budget(), saveDir = "receipts/runs", requestId = null } = {}) {
  const t0 = Date.now();
  const d = drafts.get(String(input.draft_id || ""));
  if (!d || Date.now() - d.at > DRAFT_TTL_MS) throw new InputError("unknown or expired draft_id; start again");
  const over = input.codes || {};
  const base = d.coding.input;
  const full = {
    ...base, ...d.iso,
    triggr: over.triggr ?? base.triggr, issue: over.issue ?? base.issue, pc: over.pc ?? base.pc,
    geo: over.geo ?? base.geo, power: over.power ?? base.power,
    attacker: { ...base.attacker, ...(over.attacker || {}) }, defender: { ...base.defender, ...(over.defender || {}) },
  };
  const confirmed = CONFIRM_FIELDS.filter(f => over[f] != null);
  const changed = CONFIRM_FIELDS.filter(f => over[f] != null && String(over[f]) !== String(base[f]));
  const out = await assess(full, { budget, saveDir, requestId, prebought: d.purchase, skipRunCount: true });
  out.mode = "simple";
  out.topic = d.topic;
  out.auto_coding = { validated: false, codes: full, auto_codes: base, confidence: d.coding.confidence, jev: d.coding.jev,
    confirmed_by_user: confirmed, changed_by_user: changed,
    status: confirmed.length === CONFIRM_FIELDS.length ? "key codes confirmed by the user" : "some key codes not confirmed (auto-coded)",
    note: AUTO_NOTE, report: "validation/icb/RESULT_autocode.md" };
  out.telegraph_purchase = { ...out.telegraph_purchase, reused_from_cache: d.reused };
  out.cost.jev_usd += d.coding.jev.cost_usd;
  out.latency_ms = Date.now() - t0;
  return out;
}

const CONFIRM_FIELDS = ["triggr", "issue", "pc"];
const DRAFT_TTL_MS = 3600_000;
const drafts = new Map();
const AUTO_NOTE = "Codes were chosen by Jev from the purchased news and general knowledge. Tested on 216 real crises (pre-registered): above baseline on 11 of 16 fields, " +
  "but estimates from unconfirmed auto-codes were no better than the base rate (log-lik -89.90 vs -89.25; ICB codes -87.29). The weakest fields are trigger, issue and " +
  "setting, so the app asks you to confirm them before computing the estimate. With correct codes the estimate follows the validated path.";

export class UpstreamError extends Error {}

export async function assess(input, { budget = new Budget(), saveDir = "receipts/runs", requestId = null, prebought = null, skipRunCount = false } = {}) {
  const t0 = Date.now();
  const { names, iso, news_query, coded } = normalise(input);
  if (!skipRunCount) await budget.startRun();
  const viewsP = (iso.attacker || iso.defender) ? benchmark(iso.attacker, iso.defender) : Promise.resolve(null); // runs in parallel, never throws

  // (1) validated base estimate: exactly the training format, no names, no news
  const baseState = buildState(coded);
  const baseJev = await jevRuns(baseState, budget);
  const riv = rivalryFeatures(names.defender, names.attacker); // past crises of these two states (ICB, up to 2021)
  const base = predictV3({ ...features(baseJev.runs, coded.powdis), ...(riv.x || {}) });

  // (2) news-adjusted estimate: same text + intelligence bought on Telegraph
  const purchase = prebought ?? await buyIntent("NEWS_SEARCH_GENERAL", { query: news_query }, { budget });
  let adjusted = null;
  if (purchase.ok && purchase.result?.answer) {
    const newsState = { ...baseState, recent_news: String(purchase.result.answer).slice(0, 4000),
      note: "Country names and years are withheld in the coded part. Recent news about the real parties is appended. No outcome is given." };
    const newsJev = await jevRuns(newsState, budget);
    const adj = predictV3({ ...features(newsJev.runs, coded.powdis), ...(riv.x || {}) });
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
      jev_cost_usd: baseJev.cost_usd, jev_cached: baseJev.cached, state_sha256: baseJev.state_sha256, validated: true, state: baseState,
      rivalry: riv.matched ? { ...riv.summary, icb_codes: { defender: riv.D, attacker: riv.A } }
        : { matched: false, note: "state name not found in the ICB/COW list: rivalry features set to the training average" } },
    external_benchmark: views,
    ucdp_context: ucdpContext(names.attacker, names.defender),
    news_adjusted: adjusted ?? { unavailable: true, reason: purchase.error || "no news answer", validated: false },
    telegraph_purchase: purchase.receipt,
    cost: { telegraph_test_usdc: purchase.receipt.rail === "escrow" ? (purchase.receipt.charged_usdc || 0) : (purchase.receipt.settlement_tx ? 0.01 : 0),
      jev_usd: baseJev.cost_usd + (adjusted?.jev_cost_usd || 0) },
    model: MODEL_V3_INFO, validation: VALIDATION,
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
