// Frozen v2 probability layer (validation/icb/RESULT_v2.md): L2 logistic on Jev's 10 items (3-run mean) + POWDIS/50,
// trained on 533 ICB crises up to 1989, tested out-of-time on 216 crises 1990-2021.
import { readFileSync } from "node:fs";

const M = JSON.parse(readFileSync(new URL("./model/model_v2.json", import.meta.url), "utf8"));
export const MODEL_INFO = { frozen_at: M.frozen_at, trained_on: M.trained_on, jev_model: M.jev_model, l2: M.model.l2 };
const ITEMS = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10"];
const LABEL = { J1: "attacker's stakes", J2: "defender's stakes", J3: "misperception risk", J4: "commitment problem / power shift",
  J5: "indivisibility", J6: "ruler's private gains", J7: "ruler's risk if defeated", J8: "attacker's military quality",
  J10: "defender cohesion", J9: "other major circumstance", POWDIS50: "power balance (defender minus attacker)" };

// ---------------- v3 (PREREG_v3.md, RESULT_v3.md): ordinal logit on VIOL 1-4, v2 features + as-of rivalry history ----------------
const M3 = JSON.parse(readFileSync(new URL("./model/model_v3.json", import.meta.url), "utf8"));
export const MODEL_V3_INFO = { type: M3.type, cols: M3.cols, holdout_loglik: M3.holdout.loglik, l2: M3.l2 };
const LABEL3 = { ...LABEL_BASE(), pair_crises_log: "past crises between these two states", pair_war_share: "share of those that became wars",
  def_crises_log: "defender's past crises", def_war_share: "share of the defender's crises that became wars" };
function LABEL_BASE() { return { J1: "attacker's stakes", J2: "defender's stakes", J3: "misperception risk", J4: "commitment problem / power shift",
  J5: "indivisibility", J6: "ruler's private gains", J7: "ruler's risk if defeated", J8: "attacker's military quality",
  J10: "defender cohesion", J9: "other major circumstance", POWDIS50: "power balance (defender minus attacker)" }; }

/** x = v2 features + rivalry features (missing rivalry -> training mean, i.e. neutral). Returns P(VIOL=4) and contributions. */
export function predictV3(x) {
  const { cols, mu, sd, b, cuts } = M3;
  let eta = 0;
  const contributions = cols.map((c, i) => {
    const v = x[c] == null ? mu[i] : x[c];
    const zc = b[i] * ((v - mu[i]) / sd[i]);
    eta += zc;
    return { feature: c, label: LABEL3[c], value: Number(Number(v).toFixed(3)), contribution: Number(zc.toFixed(3)), imputed: x[c] == null };
  });
  contributions.sort((p, q) => Math.abs(q.contribution) - Math.abs(p.contribution));
  return { p_war: 1 - 1 / (1 + Math.exp(-(cuts[2] - eta))), eta, contributions };
}

/** runs = Jev answer objects (each { answers }) ; powdis = ICB-style power discrepancy */
export function features(runs, powdis) {
  const x = {};
  for (const k of ITEMS) x[k] = runs.reduce((a, r) => a + Number(r.answers[k].score), 0) / runs.length;
  x.J9 = runs.reduce((a, r) => a + Number(r.answers.J9.noul ?? r.answers.J9.probability ?? 0.5), 0) / runs.length;
  x.POWDIS50 = powdis / 50;
  return x;
}

/** returns { p_war, logit, contributions:[{feature,label,value,contribution}] } ; contribution = coef * standardised value */
export function predict(x) {
  const { cols, w, mu, sd } = M.model;
  let z = w[0];
  const contributions = cols.map((c, i) => {
    const zc = w[i + 1] * ((x[c] - mu[i]) / sd[i]);
    z += zc;
    return { feature: c, label: LABEL[c], value: Number(x[c].toFixed(3)), contribution: Number(zc.toFixed(3)) };
  });
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { p_war: 1 / (1 + Math.exp(-z)), logit: z, contributions };
}
