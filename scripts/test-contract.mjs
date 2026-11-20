// Contract test: every enum in docs/openapi.yaml must equal the codes the app accepts (src/codes.mjs). Offline.
import { readFileSync } from "node:fs";
import * as C from "../src/codes.mjs";

const y = readFileSync(new URL("../docs/openapi.yaml", import.meta.url), "utf8");
function enumOf(name) {
  const line = y.split("\n").find(l => l.trimStart().startsWith(`${name}: {`) && l.includes("enum: ["));
  if (!line) return null;
  const inside = line.slice(line.indexOf("enum: [") + 7, line.indexOf("]", line.indexOf("enum: [")));
  return inside.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
}
const want = { triggr: Object.keys(C.TRIGGR), issue: Object.keys(C.ISSUE), pc: Object.keys(C.PC), geo: Object.keys(C.GEO), power: Object.keys(C.POWER),
  regime: Object.keys(C.REGIME), age: Object.keys(C.AGE), territ: Object.keys(C.TERRIT), nuclear: Object.keys(C.NUCLEAR), allycap: Object.keys(C.ALLY), sizedu: Object.keys(C.SIZEDU) };
for (const [k, codes] of Object.entries(want)) {
  const spec = enumOf(k);
  const same = spec && spec.length === codes.length && spec.every((v, i) => v === codes[i]);
  if (!same) { console.error(`FAIL ${k}: openapi ${JSON.stringify(spec)} vs code ${JSON.stringify(codes)}`); process.exitCode = 1; }
  else console.log(`ok   ${k} enum matches (${codes.length})`);
}
