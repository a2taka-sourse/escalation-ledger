// Simple mode: two countries + one topic line -> Jev picks the ICB codes.
// Split by what the facts depend on:
//   - country profile (regime, state age, territory, nuclear status, alliances): depends only on the country and the year.
//     Asked once per (country, year), cached in memory and in data/country_profiles.json. Same country -> same attributes.
//   - crisis codes (trigger, issue, setting, geography, power balance, decision group): depend on the news, asked every time.
// Names and news are used ONLY to fill the codes. The probability is still computed from the anonymised, validated text
// (src/codes.mjs buildState), so the validated pipeline is unchanged. Accuracy is measured in validation/icb (eval-autocode).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU } from "./codes.mjs";
import { askJevRaw } from "./jev.mjs";

const POWER5 = ["attacker_much", "attacker_clearly", "equal", "defender_clearly", "defender_much"];
const GEO_TEXT = { same_region: "in the same region", same_continent: "on the same continent but not the same region", far: "far apart (different continents)" };
const PROFILE_FILE = process.env.COUNTRY_PROFILE_FILE || "data/country_profiles.json";

function optionQuestions(prefix, about, table) {
  const q = {};
  for (const [code, label] of Object.entries(table))
    q[`${prefix}__${code}`] = { type: "noul", instructions: `${about}: ${label}`, criteria: { true: `this describes it: ${label}`, false: "this does not describe it" } };
  return q;
}

function argmax(answers, prefix) {
  let best = null;
  for (const [k, v] of Object.entries(answers)) {
    if (!k.startsWith(prefix + "__")) continue;
    const p = Number(v.noul ?? v.probability ?? 0);
    if (!best || p > best.p) best = { code: k.slice(prefix.length + 2), p };
  }
  return best;
}

// ---------------- country profiles ----------------
const profiles = new Map(Object.entries(existsSync(PROFILE_FILE) ? JSON.parse(readFileSync(PROFILE_FILE, "utf8")) : {}));
const pkey = (name, year) => `${String(name).trim().toLowerCase()}|${year}`;

export const profileQuestions = () => ({
  ...optionQuestions("regime", "The state's political regime is", REGIME),
  ...optionQuestions("age", "The state first became a continuously sovereign state as", AGE),
  ...optionQuestions("territ", "The state has", TERRIT),
  ...optionQuestions("nuclear", "The state has", NUCLEAR),
  ...optionQuestions("allycap", "The state is", ALLY),
});

export async function countryProfile(name, year, { budget } = {}) {
  const key = pkey(name, year);
  if (profiles.has(key)) return { ...profiles.get(key), cached: true };
  const state = { state: name, as_of_year: year, note: `Answer with well-known facts about this state as of ${year}.` };
  const jev = await askJevRaw(state, profileQuestions(), { budget });
  const codes = {}, confidence = {};
  for (const f of ["regime", "age", "territ", "nuclear", "allycap"]) { const b = argmax(jev.answers, f); codes[f] = b?.code; confidence[f] = b ? Number(b.p.toFixed(2)) : null; }
  const value = { codes, confidence, jev: { model: jev.model, cost_usd: jev.cost_usd } };
  profiles.set(key, value);
  try { writeFileSync(PROFILE_FILE, JSON.stringify(Object.fromEntries(profiles), null, 1)); } catch {}
  return { ...value, cached: false };
}

// ---------------- crisis codes ----------------
export const crisisQuestions = () => ({
  ...optionQuestions("triggr", "What triggered the crisis for the defender is", TRIGGR),
  ...optionQuestions("issue", "The main issue at stake for the defender is", ISSUE),
  ...optionQuestions("pc", "The dispute is", PC),
  ...optionQuestions("geo", "The two states are", GEO_TEXT),
  ...optionQuestions("sizedu", "The defender's response is decided by", SIZEDU),
  power: { type: "score", instructions: "Overall power (population, economy, territory, alliances, military spending, nuclear) of the two states",
    criteria: ["much in favour of the attacker", "clearly in favour of the attacker", "roughly equal", "clearly in favour of the defender", "much in favour of the defender"] },
});

/** returns { input (same shape as the full form), confidence, jev } */
export async function autoCode({ attackerName, defenderName, topic, newsText, year = new Date().getUTCFullYear() }, { budget } = {}) {
  const [pa, pd] = await Promise.all([countryProfile(attackerName, year, { budget }), countryProfile(defenderName, year, { budget })]);
  const state = {
    task: "Code this crisis for a crisis-behaviour dataset. The attacker is the state whose act created the crisis; the defender is the state that perceives the threat.",
    attacker: attackerName, defender: defenderName, topic, as_of_year: year,
    recent_news: String(newsText || "").slice(0, 4000),
  };
  const jev = await askJevRaw(state, crisisQuestions(), { budget });
  const a = jev.answers, confidence = {};
  const pick = key => { const b = argmax(a, key); confidence[key] = b ? Number(b.p.toFixed(2)) : null; return b?.code; };
  const powerScore = Math.max(0, Math.min(4, Math.round(Number(a.power?.score ?? 2))));
  confidence.power = Number(a.power?.confidence ?? NaN) || null;
  for (const [f, v] of Object.entries(pa.confidence)) confidence[`a_${f}`] = v;
  for (const [f, v] of Object.entries(pd.confidence)) confidence[`d_${f}`] = v;
  const input = {
    attacker_name: attackerName, defender_name: defenderName,
    triggr: pick("triggr"), issue: pick("issue"), pc: pick("pc"), geo: pick("geo"), power: POWER5[powerScore],
    attacker: { ...pa.codes }, defender: { ...pd.codes, sizedu: pick("sizedu") },
  };
  return { input, confidence, jev: { model: jev.model, cost_usd: jev.cost_usd + pa.jev.cost_usd * !pa.cached + pd.jev.cost_usd * !pd.cached,
    latency_ms: jev.latency_ms, crisis_questions: Object.keys(crisisQuestions()).length, profiles_cached: { attacker: pa.cached, defender: pd.cached } } };
}
