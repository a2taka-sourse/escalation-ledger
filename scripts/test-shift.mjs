// Offline tests for the news-shift labels. Run: node scripts/test-shift.mjs
import { classifyShift, movedFactors } from "../src/pipeline.mjs";

const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
const s = d => { const r = classifyShift(d); return `${r.direction}/${r.level}`; };
ok(s(0.02) === "none/negligible", "+2 pts -> negligible");
ok(s(0.05) === "up/small", "+5 pts -> up/small");
ok(s(-0.12) === "down/moderate", "-12 pts -> down/moderate");
ok(s(0.443) === "up/large", "+44 pts (Taiwan run) -> up/large");
ok(s(0.609) === "up/large", "+61 pts (Ukraine run) -> up/large");
ok(s(-0.30) === "down/large", "-30 pts -> down/large");
const m = movedFactors(
  [{ feature: "J4", label: "commitment", contribution: -0.5 }, { feature: "J9", label: "other", contribution: 0.1 }, { feature: "POWDIS50", label: "power", contribution: 0.3 }],
  [{ feature: "J4", label: "commitment", contribution: 0.2 }, { feature: "J9", label: "other", contribution: 0.9 }, { feature: "POWDIS50", label: "power", contribution: 0.3 }]);
ok(m[0].feature === "J9" && m[0].change === 0.8 && m[1].feature === "J4" && !m.find(x => x.feature === "POWDIS50"), "moved factors ranked, power excluded");
