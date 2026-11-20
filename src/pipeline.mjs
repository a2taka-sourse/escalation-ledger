// One assessment = (1) validated base probability from the coded situation, (2) news-adjusted probability using intelligence bought
// on Telegraph (labelled unvalidated), with every purchase's receipt.
import { mkdirSync, writeFileSync } from "node:fs";
import { buildState, TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU, POWER, GEO } from "./codes.mjs";
import { askJev } from "./jev.mjs";
import { features, predict, MODEL_INFO } from "./model.mjs";
import { buyIntent } from "./telegraph.mjs";
import { Budget, BudgetError } from "./budget.mjs";

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
  return {
    names,
    news_query: String(input.news_query || `${names.attacker} ${names.defender} military tension`).slice(0, 160),
    coded: {
      year: 2026, triggr: pick(TRIGGR, input.triggr, "triggr"), issue: pick(ISSUE, input.issue, "issue"), pc: pick(PC, input.pc, "pc"),
      geo: input.geo, powdis: POWER[input.power],
      attacker: side(input.attacker ?? null, "attacker", false), defender: side(input.defender, "defender", true),
    },
  };
}

async function jevRuns(state, budget, n = 3) {
  const runs = await Promise.all(Array.from({ length: n }, () => askJev(state, { budget })));
  const spread = {};
  for (const k of ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10"]) {
    const v = runs.map(r => Number(r.answers[k].score)); spread[k] = Number((Math.max(...v) - Math.min(...v)).toFixed(2));
  }
  return { runs, spread, cost_usd: runs.reduce((a, r) => a + r.cost_usd, 0), models: [...new Set(runs.map(r => r.model))] };
}

export async function assess(input, { budget = new Budget(), saveDir = "receipts/runs" } = {}) {
  const t0 = Date.now();
  const { names, news_query, coded } = normalise(input);
  await budget.startRun();

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
    adjusted = { p_war: adj.p_war, delta_vs_base: adj.p_war - base.p_war, contributions: adj.contributions, jev_spread: newsJev.spread,
      jev_models: newsJev.models, jev_cost_usd: newsJev.cost_usd, sources: purchase.result.sources ?? null, validated: false };
  }

  const out = {
    parties: names, generated_at: new Date().toISOString(), latency_ms: Date.now() - t0,
    base: { p_war: base.p_war, contributions: base.contributions, jev_spread: baseJev.spread, jev_models: baseJev.models,
      jev_cost_usd: baseJev.cost_usd, validated: true, state: baseState },
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

export { BudgetError };
