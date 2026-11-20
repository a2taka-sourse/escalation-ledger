// Offline tests for the spending guard (no network). Run: node scripts/test-budget.mjs
import { Budget, BudgetError } from "../src/budget.mjs";

class MemStore { constructor() { this.v = { total: { jevPaid: 0 }, days: {} }; } async get() { return this.v; } async set(v) { this.v = v; } }
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
const throwsKind = async (fn, kind) => { try { await fn(); return false; } catch (e) { return e instanceof BudgetError && e.kind === kind; } };

const b = new Budget(new MemStore(), { jevPaidDailyUsd: 0.0003, jevPaidTotalUsd: 0.0005, telegraphDailyUsd: 0.02, runsPerDay: 2 });
await b.startRun(); await b.startRun();
ok(await throwsKind(() => b.startRun(), "runs"), "3rd run of the day is refused");

await b.reserve("jevPaid", 0.0001); await b.settle("jevPaid", 0.0001);
await b.reserve("jevPaid", 0.0001); await b.settle("jevPaid", 0.0001);
ok(await throwsKind(() => b.reserve("jevPaid", 0.0002), "jevPaidDaily"), "paid Jev refused past the daily cap");

const b2 = new Budget(new MemStore(), { jevPaidDailyUsd: 1, jevPaidTotalUsd: 0.00025, telegraphDailyUsd: 1, runsPerDay: 9 });
await b2.settle("jevPaid", 0.0002);
ok(await throwsKind(() => b2.reserve("jevPaid", 0.0001), "jevPaidTotal"), "paid Jev refused past the total cap");

await b.reserve("telegraph", 0.01); await b.settle("telegraph", 0.01);
await b.reserve("telegraph", 0.01); await b.settle("telegraph", 0.01);
ok(await throwsKind(() => b.reserve("telegraph", 0.01), "telegraphDaily"), "Telegraph purchase refused past the daily cap");
console.log(JSON.stringify(await b.status()));
