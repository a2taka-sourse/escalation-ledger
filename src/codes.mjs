// Builds the outcome-blind situation text in EXACTLY the format the v2 model was trained on
// (port of validation/icb/build_dataset_v2.py; parity checked by scripts/test-parity.mjs against ICB v16).
export const TRIGGR = { 1: "a verbal act (protest, threat, accusation or demand)", 2: "a political act (subversion, hostile alliance, sanctions, broken treaty)",
  3: "an economic act (embargo, nationalisation, aid withheld)", 4: "an external change (new weapon system, intelligence report)",
  5: "another non-violent act", 6: "an internal challenge to the regime", 7: "a non-violent military act (show of force, mobilisation, manoeuvres)",
  8: "an indirect violent act (violence against an ally or a revolt abroad)", 9: "a violent act (attack, border clash, invasion)" };
export const ISSUE = { 1: "military-security (territory, borders, military balance)", 2: "political-diplomatic (sovereignty, hegemony, status)",
  3: "economic-developmental (resources, property, economic pressure)", 4: "cultural-status (ideology, regime, non-material values)", 5: "other" };
export const PC = { 1: "not part of a protracted conflict", 2: "part of a protracted conflict between the parties", 3: "part of a long-war protracted conflict" };
// Only codes defined in the ICB2 v16 codebook are accepted (REGIME 1-5, ALLYCAP 1-4); the training data uses no others.
export const REGIME = { 1: "a democracy", 2: "a civil authoritarian regime", 3: "a military regime (direct)", 4: "a military regime (indirect)",
  5: "a military regime (dual authority)" };
export const NUCLEAR = { 1: "no nuclear capability", 2: "a foreseeable nuclear capability", 3: "nuclear weapons without second strike", 4: "a full second-strike nuclear capability" };
export const ALLY = { 1: "non-aligned", 2: "informally allied with a great power", 3: "formally allied with a great power", 4: "itself a great-power alliance leader" };
export const TERRIT = { 1: "small territory", 2: "medium territory", 3: "large territory" };
export const AGE = { 1: "an old state (pre-1648)", 2: "an old state (1648-1814)", 3: "a state formed 1815-1918", 4: "a state formed 1919-1945",
  5: "a state formed 1946-1957", 6: "a state formed 1958-1966", 7: "a state formed 1967-1989", 8: "a state formed after 1989" };
export const SIZEDU = { 1: "a small (1-4 person) decision group", 2: "a medium (5-10) decision group", 3: "a large (10+) decision group" };
/** verbal power balance -> representative ICB POWDIS (defender minus attacker) */
export const POWER = { attacker_much: -40, attacker_clearly: -15, attacker_somewhat: -5, equal: 0, defender_somewhat: 5, defender_clearly: 15, defender_much: 40 };
export const GEO = { same_region: "The two states are in the same region.", same_continent: "The two states are on the same continent.", far: "The two states are far apart." };

const eraText = y => (y <= 1945 ? "the interwar / Second World War era" : y <= 1989 ? "the Cold War era" : "the post-Cold War era");

export function describe(side, s) {
  if (!s) return `${side}: attributes not coded.`;
  const parts = [REGIME[s.regime], AGE[s.age], TERRIT[s.territ], NUCLEAR[s.nuclear], ALLY[s.allycap]].filter(Boolean);
  return `${side}: ` + parts.join(", ") + ".";
}

export function powerText(powdis) {
  if (powdis == null) return "Relative power is not coded.";
  if (Math.abs(powdis) <= 2) return "The two sides are roughly equal in overall power (population, economy, territory, alliances, military spending, nuclear).";
  const stronger = powdis > 0 ? "the defender" : "the attacker";
  const size = Math.abs(powdis) >= 30 ? "much" : Math.abs(powdis) >= 8 ? "clearly" : "somewhat";
  return `Overall power (population, economy, territory, alliances, military spending, nuclear) is ${size} in favour of ${stronger}.`;
}

/**
 * c = { year, triggr, issue, pc, geo: "same_region"|"same_continent"|"far", powdis,
 *       attacker: {regime, age, territ, nuclear, allycap} | null,
 *       defender: {regime, age, territ, nuclear, allycap, sizedu} }
 */
export function buildState(c) {
  return {
    situation: `A crisis in ${eraText(c.year)}. The defender (the state that perceives the crisis) was triggered by ` +
      `${TRIGGR[c.triggr] ?? "an unspecified act"} from the attacker (a state). ` +
      `The main issue for the defender is ${ISSUE[c.issue] ?? "not coded"}. The dispute is ${PC[c.pc] ?? "of unknown setting"}. ` +
      `${GEO[c.geo]}`,
    attacker: describe("Attacker", c.attacker),
    defender: describe("Defender", c.defender) + (SIZEDU[c.defender?.sizedu] ? " Its response was made by " + SIZEDU[c.defender.sizedu] + "." : ""),
    power: powerText(c.powdis),
    note: "Country names and years are withheld. No outcome is given. Judge only from the situation described.",
  };
}
