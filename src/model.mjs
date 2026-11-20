// Frozen v2 probability layer (validation/icb/RESULT_v2.md): L2 logistic on Jev's 10 items (3-run mean) + POWDIS/50,
// trained on 533 ICB crises up to 1989, tested out-of-time on 216 crises 1990-2021.
import { readFileSync } from "node:fs";

const M = JSON.parse(readFileSync(new URL("./model/model_v2.json", import.meta.url), "utf8"));
export const MODEL_INFO = { frozen_at: M.frozen_at, trained_on: M.trained_on, jev_model: M.jev_model, l2: M.model.l2 };
const ITEMS = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10"];
const LABEL = { J1: "attacker's stakes", J2: "defender's stakes", J3: "misperception risk", J4: "commitment problem / power shift",
  J5: "indivisibility", J6: "ruler's private gains", J7: "ruler's risk if defeated", J8: "attacker's military quality",
  J10: "defender cohesion", J9: "other major circumstance", POWDIS50: "power balance (defender minus attacker)" };

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
