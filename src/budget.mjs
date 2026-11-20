// Spending guard for the public app. Every paid action asks reserve() first and settle() after.
// Limits (env, USD): JEV_PAID_DAILY_USD, JEV_PAID_TOTAL_USD, TELEGRAPH_DAILY_USD, RUNS_PER_DAY.
// Store: local JSON file by default (BUDGET_FILE). On serverless, swap in a KV store with the same get/set interface.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export const LIMITS = {
  jevPaidDailyUsd: Number(process.env.JEV_PAID_DAILY_USD ?? 0.05),   // ~870 paid Jev calls/day at $0.0000572
  jevPaidTotalUsd: Number(process.env.JEV_PAID_TOTAL_USD ?? 1.00),   // whole-hackathon cap for paid Jev
  telegraphDailyUsd: Number(process.env.TELEGRAPH_DAILY_USD ?? 1.00), // test USDC, 100 purchases/day
  runsPerDay: Number(process.env.RUNS_PER_DAY ?? 100),
};

export class FileStore {
  constructor(path = process.env.BUDGET_FILE || "budget-ledger.json") { this.path = path; }
  async get() { return existsSync(this.path) ? JSON.parse(readFileSync(this.path, "utf8")) : { total: { jevPaid: 0 }, days: {} }; }
  async set(v) { writeFileSync(this.path, JSON.stringify(v, null, 1)); }
}

/** Upstash Redis over REST (free tier). Used automatically when UPSTASH_REDIS_REST_URL/TOKEN are set (hosted deployments). */
export class RedisStore {
  constructor(url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN, key = "escalation-ledger:budget") {
    this.url = url.replace(/\/$/, ""); this.token = token; this.key = key;
  }
  async #cmd(args) {
    const r = await fetch(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args), signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(`budget store: ${d.error || r.status}`);
    return d.result;
  }
  async get() { const v = await this.#cmd(["GET", this.key]); return v ? JSON.parse(v) : { total: { jevPaid: 0 }, days: {} }; }
  async set(v) { await this.#cmd(["SET", this.key, JSON.stringify(v)]); }
}

export const defaultStore = () =>
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? new RedisStore() : new FileStore();

const today = () => new Date().toISOString().slice(0, 10); // UTC day

export class BudgetError extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind; }
}

export class Budget {
  constructor(store = defaultStore(), limits = LIMITS) { this.store = store; this.limits = limits; }

  async #day(l) { const d = today(); l.days[d] ??= { runs: 0, jevPaid: 0, telegraph: 0 }; return l.days[d]; }

  /** call once per user request */
  async startRun() {
    const l = await this.store.get(), d = await this.#day(l);
    if (d.runs >= this.limits.runsPerDay) throw new BudgetError("runs", `daily run limit (${this.limits.runsPerDay}) reached`);
    d.runs++; await this.store.set(l);
  }

  /** kind: "jevPaid" | "telegraph"; est = expected USD for the next call */
  async reserve(kind, est) {
    const l = await this.store.get(), d = await this.#day(l);
    if (kind === "jevPaid") {
      if (d.jevPaid + est > this.limits.jevPaidDailyUsd) throw new BudgetError("jevPaidDaily", "daily paid-Jev budget reached");
      if (l.total.jevPaid + est > this.limits.jevPaidTotalUsd) throw new BudgetError("jevPaidTotal", "total paid-Jev budget reached");
    } else if (kind === "telegraph") {
      if (d.telegraph + est > this.limits.telegraphDailyUsd) throw new BudgetError("telegraphDaily", "daily Telegraph budget reached");
    }
  }

  async settle(kind, usd) {
    const l = await this.store.get(), d = await this.#day(l);
    d[kind] = (d[kind] || 0) + usd;
    if (kind === "jevPaid") l.total.jevPaid += usd;
    await this.store.set(l);
  }

  async status() { const l = await this.store.get(); return { limits: this.limits, today: await this.#day(l), total: l.total }; }
}
