// Simple mode: two countries + one topic line -> Jev reads the purchased news and picks the ICB codes.
// Names and news are used ONLY to fill the codes. The probability is still computed from the anonymised, validated text
// (src/codes.mjs buildState), so the validated pipeline is unchanged. The auto-coding itself is NOT validated; the UI says so.
import { TRIGGR, ISSUE, PC, REGIME, AGE, TERRIT, NUCLEAR, ALLY, SIZEDU, GEO } from "./codes.mjs";
import { askJevRaw } from "./jev.mjs";

const POWER5 = ["attacker_much", "attacker_clearly", "equal", "defender_clearly", "defender_much"];
const GEO_TEXT = { same_region: "in the same region", same_continent: "on the same continent but not the same region", far: "far apart (different continents)" };

/** one noul question per option; the answer is the option with the highest probability */
function optionQuestions(prefix, about, table) {
  const q = {};
  for (const [code, label] of Object.entries(table))
    q[`${prefix}__${code}`] = { type: "noul", instructions: `${about}: ${label}`, criteria: { true: `this describes it: ${label}`, false: `this does not describe it` } };
  return q;
}

export function buildCodingQuestions() {
  const side = (who, s) => ({
    ...optionQuestions(`${s}_regime`, `The ${who}'s political regime is`, REGIME),
    ...optionQuestions(`${s}_age`, `The ${who} first became a continuously sovereign state as`, AGE),
    ...optionQuestions(`${s}_territ`, `The ${who} has`, TERRIT),
    ...optionQuestions(`${s}_nuclear`, `The ${who} has`, NUCLEAR),
    ...optionQuestions(`${s}_allycap`, `The ${who} is`, ALLY),
  });
  return {
    ...optionQuestions("triggr", "What most recently triggered the crisis for the defender is", TRIGGR),
    ...optionQuestions("issue", "The main issue at stake for the defender is", ISSUE),
    ...optionQuestions("pc", "The dispute is", PC),
    ...optionQuestions("geo", "The two states are", GEO_TEXT),
    ...side("attacker", "a"), ...side("defender", "d"),
    ...optionQuestions("d_sizedu", "The defender's response is decided by", SIZEDU),
    power: { type: "score", instructions: "Overall power (population, economy, territory, alliances, military spending, nuclear) of the two states",
      criteria: ["much in favour of the attacker", "clearly in favour of the attacker", "roughly equal", "clearly in favour of the defender", "much in favour of the defender"] },
  };
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

/** returns { input (same shape as the full form), confidence, jev } */
export async function autoCode({ attackerName, defenderName, topic, newsText }, { budget } = {}) {
  const state = {
    task: "Code this crisis for a crisis-behaviour dataset. The attacker is the state whose act created the crisis; the defender is the state that perceives the threat.",
    attacker: attackerName, defender: defenderName, topic,
    recent_news: String(newsText || "").slice(0, 4000),
    note: "Use well-known facts about the two states for regime, age, territory, nuclear status and alliances; use the news for trigger, issue and setting.",
  };
  const jev = await askJevRaw(state, buildCodingQuestions(), { budget });
  const a = jev.answers, confidence = {};
  const pick = key => { const b = argmax(a, key); confidence[key] = b ? Number(b.p.toFixed(2)) : null; return b?.code; };
  const powerScore = Math.max(0, Math.min(4, Math.round(Number(a.power?.score ?? 2))));
  confidence.power = Number(a.power?.confidence ?? NaN) || null;
  const side = s => ({ regime: pick(`${s}_regime`), age: pick(`${s}_age`), territ: pick(`${s}_territ`), nuclear: pick(`${s}_nuclear`), allycap: pick(`${s}_allycap`) });
  const input = {
    attacker_name: attackerName, defender_name: defenderName,
    triggr: pick("triggr"), issue: pick("issue"), pc: pick("pc"), geo: pick("geo"), power: POWER5[powerScore],
    attacker: side("a"), defender: { ...side("d"), sizedu: pick("d_sizedu") },
  };
  return { input, confidence, jev: { model: jev.model, cost_usd: jev.cost_usd, latency_ms: jev.latency_ms, questions: Object.keys(buildCodingQuestions()).length } };
}
