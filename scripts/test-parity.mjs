// Parity: (1) JS situation text == training text for all 749 ICB cases; (2) JS v2 probability == Python (fit_v2.py) on the holdout.
import { readFileSync } from "node:fs";
import { buildState } from "../src/codes.mjs";
import { features, predict } from "../src/model.mjs";

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
const byCA = new Map(raw.map(r => [`${r.crisno}|${r.cracid}`, r]));
const cases = readFileSync("validation/icb/data/cases_v2.jsonl", "utf8").split("\n").filter(Boolean).map(JSON.parse);
const caseById = new Map(cases.map(c => [c.id, c]));

// rebuild each case from raw codes using the same selection logic as build_dataset_v2.py
const seen = {}; let n = 0, same = 0; const bad = [];
for (const d of raw) {
  if (["995", "996", "997", ""].includes(d.trigent) || !["1", "2", "3", "4"].includes(d.viol)) continue;
  const powdis = Number.parseInt(d.powdis, 10);
  if (!/^-?\d+$/.test(d.powdis)) continue;
  const year = Number(d.yrtrig || d.systrgyr);
  let a = byCA.get(`${d.crisno}|${d.trigent}`) ?? null;
  if (!a) {
    const prior = raw.filter(r => r.cracid === d.trigent && Number(r.yrtrig || r.systrgyr || 0) <= year);
    a = prior.length ? prior.reduce((m, r) => (Number(r.yrtrig || 0) > Number(m.yrtrig || 0) ? r : m)) : null;
  }
  let id = `${d.crisno}-${d.cracid}`; seen[id] = (seen[id] || 0) + 1; if (seen[id] > 1) id = `${id}-${seen[id]}`;
  const geo = a && a.actloc === d.actloc ? "same_region" : a && a.actloc.slice(0, 1) === d.actloc.slice(0, 1) ? "same_continent" : "far";
  const side = r => r && { regime: r.regime, age: r.age, territ: r.territ, nuclear: r.nuclear, allycap: r.allycap };
  const st = buildState({ year, triggr: d.triggr, issue: d.issue, pc: d.pc, geo, powdis, attacker: side(a), defender: { ...side(d), sizedu: d.sizedu } });
  n++;
  if (JSON.stringify(st) === JSON.stringify(caseById.get(id)?.state)) same++; else if (bad.length < 3) bad.push({ id, js: st, py: caseById.get(id)?.state });
}
console.log(`text parity: ${same}/${n} identical (expected ${cases.length})`);
if (bad.length) console.log(JSON.stringify(bad, null, 1));

// model parity
const jev = JSON.parse(readFileSync("validation/icb/data/jev.json", "utf8")).items;
const py = JSON.parse(readFileSync("validation/icb/data/py_holdout_pred.json", "utf8"));
let maxd = 0;
for (const c of cases.filter(c => c.split === "holdout")) {
  const runs = [0, 1, 2].map(r => jev[`${c.id}#${r}`]);
  const p = predict(features(runs, c.game.powdis)).p_war;
  maxd = Math.max(maxd, Math.abs(p - py[c.id]));
}
console.log(`model parity: max |JS - Python| over ${Object.keys(py).length} holdout cases = ${maxd.toExponential(2)}`);
if (same !== cases.length || maxd > 1e-9) process.exitCode = 1;
