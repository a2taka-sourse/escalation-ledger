// UCDP context: recorded armed conflict between the two states (Dyadic 26.1, 1946-2025) and this year's state-based violence from the
// UCDP Candidate Events monthly releases. Built offline by scripts/build_ucdp.py into src/model/ucdp_context.json (CC BY 4.0).
// Shown for context only: it is not an input to the validated probability and has not been validated as a predictor here.
import { readFileSync } from "node:fs";
import { cowCode } from "./rivalry.mjs";

const U = JSON.parse(readFileSync(new URL("./model/ucdp_context.json", import.meta.url), "utf8"));

// COW -> Gleditsch-Ward codes, only where they differ (the app's names resolve to COW; UCDP uses GW)
const COW_TO_GW = { 255: [260, 255], 345: [340, 345], 679: [678] };
const gw = cow => (cow == null ? [] : COW_TO_GW[cow] ?? [Number(cow)]);
const keys = (a, b) => a.flatMap(x => b.map(y => [x, y].sort((p, q) => p - q).join("-")));

function sumMonths(byMonth, months) {
  return months.reduce((t, m) => ({ events: t.events + (byMonth?.[m]?.events || 0), deaths_best: t.deaths_best + (byMonth?.[m]?.deaths_best || 0) }),
    { events: 0, deaths_best: 0 });
}

/** context for two state names; never throws */
export function ucdpContext(attackerName, defenderName) {
  try {
    const A = gw(cowCode(attackerName)), D = gw(cowCode(defenderName));
    if (!A.length || !D.length) return { matched: false, note: "state name not found in the COW list" };
    const pk = keys(A, D);
    const years = pk.flatMap(k => U.interstate_dyad_years[k] || []);
    const byYear = new Map(); for (const y of years) byYear.set(y.year, Math.max(byYear.get(y.year) || 0, y.intensity));
    const yrs = [...byYear.keys()].sort((a, b) => a - b);
    const months = U.source.candidate_months, last3 = months.slice(-3);
    const pairMonths = {};
    for (const k of pk) for (const [m, v] of Object.entries(U.candidate_state_based_by_government_pair_month[k] || {})) {
      pairMonths[m] = { events: (pairMonths[m]?.events || 0) + v.events, deaths_best: (pairMonths[m]?.deaths_best || 0) + v.deaths_best };
    }
    const country = codes => codes.reduce((acc, c) => {
      const s = sumMonths(U.candidate_state_based_by_country_month[String(c)], last3);
      return { events: acc.events + s.events, deaths_best: acc.deaths_best + s.deaths_best };
    }, { events: 0, deaths_best: 0 });
    return {
      matched: true,
      provider: "UCDP (Uppsala Conflict Data Program)",
      interstate_history: {
        conflict_years: yrs.length, war_years: yrs.filter(y => byYear.get(y) === 2).length,
        first_year: yrs[0] ?? null, last_year: yrs.at(-1) ?? null,
        recent: yrs.slice(-8).map(y => ({ year: y, intensity: byYear.get(y) === 2 ? "war (>=1,000 deaths)" : "minor (25-999 deaths)" })),
        covers: "1946-2025, interstate dyads, UCDP Dyadic 26.1",
      },
      this_year: {
        months: [months[0], months.at(-1)],
        between_the_two_governments: sumMonths(pairMonths, months),
        last_3_months: { window: [last3[0], last3.at(-1)], in_attacker_territory: country(A), in_defender_territory: country(D) },
        note: "UCDP Candidate events: preliminary monthly data, state-based violence only; deaths are UCDP's best estimate.",
      },
      not_comparable_note: "Recorded past violence, not a forecast. Shown for context only; not an input to the validated probability.",
      licence: U.source.licence,
    };
  } catch (e) {
    return { matched: false, error: String(e.message).slice(0, 120) };
  }
}
