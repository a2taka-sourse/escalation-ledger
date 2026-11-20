// Evaluate simple-mode auto-coding against ICB coders on the 216 holdout cases (validation/icb/PREREG_autocode.md).
// Usage: COUNTRY_PROFILE_FILE=validation/icb/data/eval_profiles.json node scripts/eval-autocode.mjs
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { autoCode } from "../src/autocode.mjs";
import { askJev } from "../src/jev.mjs";
import { buildState, POWER } from "../src/codes.mjs";
import { features, predict } from "../src/model.mjs";
import { Budget } from "../src/budget.mjs";

class MemStore { constructor() { this.v = { total: { jevPaid: 0 }, days: {} }; } async get() { return this.v; } async set(v) { this.v = v; } }
const budget = new Budget(new MemStore(), { jevPaidDailyUsd: 0.5, jevPaidTotalUsd: 0.5, telegraphDailyUsd: 0, runsPerDay: 1e9 });

function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...rest] = rows.filter(r => r.length > 1);
  const head = h.map(x => x.replace(/^﻿/, ""));
  return rest.map(r => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ""])));
}

const raw = parseCsv(readFileSync("data/icb_raw/icb2_v16.csv", "utf8"));
const cow = Object.fromEntries(parseCsv(readFileSync("data/icb_raw/cow_codes.csv", "utf8")).map(r => [r.CCode, r.StateNme]));
const byCA = new Map(raw.map(r => [`${r.crisno}|${r.cracid}`, r]));
const cases = readFileSync("validation/icb/data/cases_v2.jsonl", "utf8").split("\n").filter(Boolean).map(JSON.parse);
const Y = JSON.parse(readFileSync("validation/icb/data/outcomes_v2.json", "utf8"));
const jevCache = JSON.parse(readFileSync("validation/icb/data/jev.json", "utf8")).items;

// rebuild ICB codes for every case id (same selection logic as build_dataset_v2.py)
const truth = {}; const seen = {};
for (const d of raw) {
  if (["995", "996", "997", ""].includes(d.trigent) || !["1", "2", "3", "4"].includes(d.viol) || !/^-?\d+$/.test(d.powdis)) continue;
  const year = Number(d.yrtrig || d.systrgyr);
  let a = byCA.get(`${d.crisno}|${d.trigent}`) ?? null;
  if (!a) { const prior = raw.filter(r => r.cracid === d.trigent && Number(r.yrtrig || r.systrgyr || 0) <= year); a = prior.length ? prior.reduce((m, r) => (Number(r.yrtrig || 0) > Number(m.yrtrig || 0) ? r : m)) : null; }
  let id = `${d.crisno}-${d.cracid}`; seen[id] = (seen[id] || 0) + 1; if (seen[id] > 1) id = `${id}-${seen[id]}`;
  const geo = a && a.actloc === d.actloc ? "same_region" : a && a.actloc.slice(0, 1) === d.actloc.slice(0, 1) ? "same_continent" : "far";
  const p = Number(d.powdis), side = Math.abs(p) <= 2 ? "equal" : p > 0 ? "defender" : "attacker";
  truth[id] = { crisno: d.crisno, crisname: d.crisname, year, defenderName: cow[d.cracid] || d.actor, attackerName: cow[d.trigent] || (a && a.actor) || d.trigent,
    triggr: d.triggr, issue: d.issue, pc: d.pc, geo, power_side: side,
    a: a && { regime: a.regime, age: a.age, territ: a.territ, nuclear: a.nuclear, allycap: a.allycap },
    d: { regime: d.regime, age: d.age, territ: d.territ, nuclear: d.nuclear, allycap: d.allycap, sizedu: ["1", "2", "3"].includes(d.sizedu) ? d.sizedu : null } };
}

/** Background + Pre-crisis + first paragraph after "Summary:" (pre-registered cut) */
function onsetText(crisno) {
  const f = `data/icb_raw/summaries/${crisno}.txt`;
  if (!existsSync(f)) return null;
  const t = readFileSync(f, "utf8").replace(/\r/g, "");
  const i = t.indexOf("Summary:");
  const head = (i >= 0 ? t.slice(0, i) : t).replace(/^CRISNO.*\n/, "");
  const firstPara = i >= 0 ? (t.slice(i + 8).trim().split(/\n\s*\n/)[0] || "") : "";
  return `${head.trim()}\n\nTrigger: ${firstPara.trim()}`.slice(0, 4000);
}

const hold = cases.filter(c => c.split === "holdout");
const FIELDS = ["triggr", "issue", "pc", "geo", "power_side", "a_regime", "a_age", "a_territ", "a_nuclear", "a_allycap", "d_regime", "d_age", "d_territ", "d_nuclear", "d_allycap", "d_sizedu"];
const sideOf = pw => pw.startsWith("attacker") ? "attacker" : pw.startsWith("defender") ? "defender" : "equal";
const trueField = (t, f) => f.startsWith("a_") ? t.a?.[f.slice(2)] : f.startsWith("d_") ? t.d?.[f.slice(2)] : t[f];
const autoField = (inp, f) => f === "power_side" ? sideOf(inp.power) : f.startsWith("a_") ? inp.attacker?.[f.slice(2)] : f.startsWith("d_") ? inp.defender?.[f.slice(2)] : inp[f];

// majority baseline from TRAIN
const majority = {};
for (const f of FIELDS) {
  const cnt = {}; for (const c of cases.filter(c => c.split === "train")) { const v = trueField(truth[c.id], f); if (v) cnt[v] = (cnt[v] || 0) + 1; }
  majority[f] = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]?.[0];
}

// Amendment 1 (infrastructure only): per-case checkpoint so a crash can resume without recomputing finished cases.
const CKPT = "validation/icb/data/autocode_checkpoint.jsonl";
const out = existsSync(CKPT) ? readFileSync(CKPT, "utf8").split("\n").filter(Boolean).map(JSON.parse) : [];
const doneIds = new Set(out.map(r => r.id));
let skipped = 0;
async function one(c) {
  if (doneIds.has(c.id)) return;
  const t = truth[c.id], text = onsetText(t.crisno);
  if (!text) { skipped++; return; }
  const ac = await autoCode({ attackerName: t.attackerName, defenderName: t.defenderName, topic: t.crisname.toLowerCase(), newsText: text, year: t.year }, { budget });
  const inp = ac.input;
  const coded = { year: t.year, triggr: inp.triggr, issue: inp.issue, pc: inp.pc, geo: inp.geo, powdis: POWER[inp.power], attacker: inp.attacker, defender: inp.defender };
  const runs = await Promise.all([0, 1, 2].map(() => askJev(buildState(coded), { budget })));
  const pAuto = predict(features(runs, POWER[inp.power])).p_war;
  const pTrue = predict(features([0, 1, 2].map(r => jevCache[`${c.id}#${r}`]), c.game.powdis)).p_war;
  const row = { id: c.id, war: Y[c.id].war, pAuto, pTrue, match: Object.fromEntries(FIELDS.map(f => [f, trueField(t, f) ? autoField(inp, f) === trueField(t, f) : null])),
    auto: inp, cost: ac.jev.cost_usd + runs.reduce((a, r) => a + r.cost_usd, 0) };
  out.push(row);
  appendFileSync(CKPT, JSON.stringify(row) + "\n");
  if (out.length % 20 === 0) console.log(`${out.length}/${hold.length} done, skipped ${skipped}`);
}
const queue = [...hold];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await one(queue.shift()); }));

const ll = rows => rows.reduce((a, r) => a + (r.war ? Math.log(Math.max(r.p, 1e-6)) : Math.log(Math.max(1 - r.p, 1e-6))), 0);
const brier = rows => rows.reduce((a, r) => a + (r.p - r.war) ** 2, 0) / rows.length;
const acc = {};
for (const f of FIELDS) {
  const m = out.map(r => r.match[f]).filter(v => v !== null);
  const base = out.map(r => { const tv = trueField(truth[r.id], f); return tv ? tv === majority[f] : null; }).filter(v => v !== null);
  acc[f] = { n: m.length, agreement: Number((m.filter(Boolean).length / m.length).toFixed(3)), majority_baseline: Number((base.filter(Boolean).length / base.length).toFixed(3)) };
}
const trainRate = cases.filter(c => c.split === "train").reduce((a, c) => a + Y[c.id].war, 0) / cases.filter(c => c.split === "train").length;
const res = {
  n_evaluated: out.length, n_skipped_no_summary: skipped,
  field_agreement: acc,
  downstream: {
    auto_codes: { loglik: Number(ll(out.map(r => ({ war: r.war, p: r.pAuto }))).toFixed(3)), brier: Number(brier(out.map(r => ({ war: r.war, p: r.pAuto }))).toFixed(4)) },
    icb_codes: { loglik: Number(ll(out.map(r => ({ war: r.war, p: r.pTrue }))).toFixed(3)), brier: Number(brier(out.map(r => ({ war: r.war, p: r.pTrue }))).toFixed(4)) },
    base_rate: { loglik: Number(ll(out.map(r => ({ war: r.war, p: trainRate }))).toFixed(3)) },
    mean_abs_diff_auto_vs_icb: Number((out.reduce((a, r) => a + Math.abs(r.pAuto - r.pTrue), 0) / out.length).toFixed(4)),
  },
  jev_cost_usd: Number(out.reduce((a, r) => a + r.cost, 0).toFixed(4)),
};
res.PASS = res.downstream.auto_codes.loglik > res.downstream.base_rate.loglik;
writeFileSync("validation/icb/data/result_autocode.json", JSON.stringify(res, null, 1));
writeFileSync("validation/icb/data/autocode_cases.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(res, null, 1));
