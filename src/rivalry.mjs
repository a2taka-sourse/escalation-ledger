// As-of rivalry history from ICB v16 (the "past performance" features of v3, borrowed from horse-racing form lines).
// Uses only crises with a strictly earlier trigger year than the assessment year.
import { readFileSync } from "node:fs";

const H = JSON.parse(readFileSync(new URL("./model/icb_history.json", import.meta.url), "utf8")).rows; // [year, actorCode, triggerCode, viol]
const NAMES = JSON.parse(readFileSync(new URL("./model/cow_names.json", import.meta.url), "utf8"));    // code -> {abb, name}

const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const ALIASES = { "united states": "2", "usa": "2", "us": "2", "america": "2", "uk": "200", "britain": "200", "great britain": "200",
  "south korea": "732", "republic of korea": "732", "north korea": "731", "dprk": "731", "iran": "630", "syria": "652", "russia": "365",
  "soviet union": "365", "ussr": "365", "vietnam": "816", "dr congo": "490", "drc": "490", "congo kinshasa": "490", "congo brazzaville": "484",
  "ivory coast": "437", "cote d ivoire": "437", "czechia": "316", "burma": "775", "east timor": "860", "timor leste": "860", "taiwan": "713", "prc": "710", "serbia": "345", "north macedonia": "343", "eswatini": "572" };
const BY_NAME = new Map();
for (const [code, v] of Object.entries(NAMES)) { BY_NAME.set(norm(v.name), code); BY_NAME.set(norm(v.abb), code); }
for (const [a, code] of Object.entries(ALIASES)) BY_NAME.set(a, code);

/** state name (or COW abbreviation) -> COW code, or null */
export function cowCode(name) { return BY_NAME.get(norm(name)) ?? null; }

/** the four v3 rivalry features; null when a state cannot be matched */
export function rivalryFeatures(defenderName, attackerName, year = new Date().getUTCFullYear()) {
  return rivalryByCodes(cowCode(defenderName), cowCode(attackerName), year);
}

export function rivalryByCodes(D, A, year) {
  if (!D || !A) return { matched: false, D, A, x: null };
  const pair = H.filter(h => h[0] < year && ((h[1] === D && h[2] === A) || (h[1] === A && h[2] === D)));
  const dpast = H.filter(h => h[0] < year && h[1] === D);
  const war = rows => rows.filter(h => h[3] === 4).length;
  return {
    matched: true, D, A,
    summary: { pair_crises: pair.length, pair_wars: war(pair), defender_crises: dpast.length, defender_wars: war(dpast), data_until: 2021 },
    x: { pair_crises_log: Math.log1p(pair.length), pair_war_share: war(pair) / (pair.length + 1),
         def_crises_log: Math.log1p(dpast.length), def_war_share: war(dpast) / (dpast.length + 2) },
  };
}
