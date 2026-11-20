// Jev via OpenCode Zen /v1/systemone (TypeSafe-native schema: the boolean type is "noul").
// Policy: always try the free model jev-1.13-free. ONLY when Zen answers FreeUsageLimitError, retry the same request on the
// paid jev-1.13, after the Budget allows it (daily + total caps). Measured price 2026-11-20: USD 0.0000572 per call.
// (Vercel AI Gateway /v1/evaluate "typesafe-ai/jev" refuses free-tier credits since Nov 2026.)
// Quantifies only; never sees the outcome. Questions are English translations of ngcm_war_game.py.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const ENDPOINT = "https://opencode.ai/zen/v1/systemone";
export const MODEL = "jev-1.13-free";
export const PAID_MODEL = "jev-1.13";
const PAID_EST_USD = 0.0001; // reservation per paid call (measured 0.0000572)
const zenKey = () => process.env.OPENCODE_ZEN_KEY ||
  JSON.parse(readFileSync(process.env.OPENCODE_AUTH || `${homedir()}/.local/share/opencode/auth.json`, "utf8")).opencode.key;

const Q = {
  J1: ["For the attacker's ruler, how heavy is the value of obtaining the contested object compared with its tax/economic value (including prestige, security, religion, national aspirations)?",
    ["much lighter than its economic value", "somewhat lighter", "about equal", "heavier (prestige or security added)", "far heavier (survival or faith at stake)"]],
  J2: ["For the defender's ruler, how heavy is losing the contested object compared with its tax/economic value (homeland, sacred sites, prestige)?",
    ["much lighter", "somewhat lighter", "about equal", "heavier", "far heavier (regime survival at stake)"]],
  J3: ["Are both sides likely to misjudge the other's true strength or resolve (distance, unfamiliar opponent, opaque internal state, new military technology, domestic turmoil)?",
    ["they know each other well", "slightly prone to misjudge", "moderately prone", "highly prone", "almost nothing is known"]],
  J4: ["From the attacker's view, is the balance of power likely to shift against it if it waits (rival rising, itself declining), or are negotiated promises unlikely to be kept in future?",
    ["not at all", "slightly", "moderately", "strongly", "extremely (now or never)"]],
  J5: ["Is the contested object hard to split through negotiation (sacred site, capital, a single resource, independence itself)?",
    ["easily divisible", "slightly hard to divide", "moderately hard", "very hard", "indivisible (all or nothing)"]],
  J6: ["How large are the personal gains the attacker's ruler and inner circle would get from the war itself (territory, wealth, positions to distribute; larger in narrow-coalition regimes)?",
    ["almost none", "small", "moderate", "large", "very large"]],
  J7: ["How large is the risk that the attacker's ruler loses position or life if the war is lost?",
    ["almost none", "small", "moderate", "large", "very large"]],
  J8: ["Setting troop numbers aside, how does the attacker's military quality (technology, organisation, morale, logistics) compare with the defender's?",
    ["far inferior", "inferior", "about equal", "superior", "far superior"]],
  J10: ["Is the defender cohesive enough as a state to raise troops and supplies from the population it governs (coalitions, fragmentation, civil strife and recent war exhaustion lower this)?",
    ["fragmented, can raise almost nothing", "weak cohesion, raises only part", "average", "well united", "highly centralised and united"]],
};
const GENERIC = ["There is some circumstance, not captured by the items above, that greatly changes the likelihood of war in this situation.",
  "a major circumstance outside the items above exists", "the items above roughly capture the situation"];

export function buildQuestions() {
  const q = {};
  for (const [k, [ins, levels]] of Object.entries(Q)) q[k] = { type: "score", instructions: ins, criteria: levels };
  q.J9 = { type: "noul", instructions: GENERIC[0], criteria: { true: GENERIC[1], false: GENERIC[2] } };
  return q;
}

async function post(model, state, timeoutMs, questions = buildQuestions()) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${zenKey()}`, "Content-Type": "application/json", "User-Agent": "telegraph-h2-escalation/1.0" },
    body: JSON.stringify({ model, state, questions }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: r.status, text: await r.text() };
}

/** the 10 war-judgment questions (validated set) */
export function askJev(state, opts = {}) { return askJevRaw(state, buildQuestions(), opts); }

/**
 * Any question set (e.g. auto-coding). budget = Budget instance (required for the paid path; without it the paid path is disabled).
 * Returns { model, billing, answers, usage, cost_usd, latency_ms }
 */
export async function askJevRaw(state, questions, { budget = null, timeoutMs = 60000 } = {}) {
  const t0 = Date.now();
  let model = MODEL, res = await post(model, state, timeoutMs, questions);
  if (res.status !== 200 && res.text.includes("FreeUsageLimitError")) {
    if (!budget) throw new Error("Jev free limit reached and no budget configured for the paid fallback");
    await budget.reserve("jevPaid", PAID_EST_USD); // throws BudgetError when a cap would be exceeded
    model = PAID_MODEL;
    res = await post(model, state, timeoutMs, questions);
  }
  if (res.status !== 200) throw new Error(`Jev HTTP ${res.status}: ${res.text.slice(0, 300)}`);
  const d = JSON.parse(res.text);
  const billing = d?.usage?.opencode?.billing_source ?? null;
  const cost = Number(d?.usage?.cost ?? 0);
  if (billing === "balance" && budget) await budget.settle("jevPaid", cost);
  return { model: d.model || model, billing, answers: d.answers, usage: d.usage ?? null, cost_usd: cost, latency_ms: Date.now() - t0 };
}

/** average of several Jev runs -> { scores:{J1..J10}, generic, coh, spread } */
export function summarize(runs) {
  const keys = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10"];
  const scores = {}, spread = {};
  for (const k of keys) {
    const v = runs.map(r => Number(r.answers[k]?.score));
    scores[k] = v.reduce((a, b) => a + b, 0) / v.length;
    spread[k] = Math.max(...v) - Math.min(...v);
  }
  const pTrue = a => Number(a?.noul ?? a?.probability ?? a?.probabilities?.true ?? 0.5);
  const generic = runs.map(r => pTrue(r.answers.J9)).reduce((a, b) => a + b, 0) / runs.length;
  return { scores, generic, coh: scores.J10, spread };
}
