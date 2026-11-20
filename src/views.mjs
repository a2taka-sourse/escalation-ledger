// External benchmark: VIEWS (Uppsala University / PRIO) open monthly conflict forecasts. Shown next to our estimate, never blended.
// API (alpha, no authentication): https://api.viewsforecasting.org  — docs https://github.com/prio-data/views_api (MIT).
// Quantity: per country-month, P(>= 25 battle-related deaths in state-based conflict) ("main_dich") and predicted fatalities ("main_mean").
// That is NOT our quantity (P(a given crisis reaches full-scale war)); the UI says so.
const API = process.env.VIEWS_API || "https://api.viewsforecasting.org";
const TTL_MS = 6 * 3600_000;
const cache = new Map(); // key -> { at, value }

async function getJson(url, timeoutMs = 10000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "escalation-ledger/0.1 (+github.com/a2taka-sourse/escalation-ledger)" } });
  if (!r.ok) throw new Error(`VIEWS HTTP ${r.status}`);
  return r.json();
}

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** latest published fatalities run, e.g. "fatalities003_2026_09_t01" (run names sort chronologically) */
export async function latestRun() {
  return cached("run", async () => {
    const { runs } = await getJson(`${API}/`);
    const f = runs.filter(r => /^fatalities\d+_\d{4}_\d{2}_t\d+$/.test(r)).sort();
    if (!f.length) throw new Error("no VIEWS fatalities run listed");
    return f[f.length - 1];
  });
}

/** next `months` country-month forecasts for an ISO-3 code. Returns null for an unknown/uncovered country. */
export async function countryForecast(iso, months = 12) {
  if (!/^[A-Z]{3}$/.test(iso || "")) return null;
  const run = await latestRun();
  return cached(`${run}:${iso}:${months}`, async () => {
    const j = await getJson(`${API}/${run}/cm/sb?iso=${iso}&pagesize=${months}`);
    if (!j.data?.length) return null;
    const rows = j.data.map(d => ({ year: d.year, month: d.month, p_25_brd: d.main_dich, fatalities: d.main_mean }));
    const next3 = rows.slice(0, 3);
    return {
      run, iso, country: j.data[0].name, rows,
      summary: {
        max_p_25_brd_next_3_months: Math.max(...next3.map(r => r.p_25_brd)),
        predicted_fatalities_next_12_months: Number(rows.reduce((a, r) => a + r.fatalities, 0).toFixed(1)),
      },
      source: `${API}/${run}/cm/sb?iso=${iso}`,
    };
  });
}

/** both parties, failures isolated (benchmark must never break an assessment) */
export async function benchmark(attackerIso, defenderIso) {
  const one = async iso => { try { return await countryForecast(iso); } catch (e) { return { iso, error: String(e.message).slice(0, 120) }; } };
  const [attacker, defender] = await Promise.all([one(attackerIso), one(defenderIso)]);
  return {
    provider: "VIEWS (Uppsala University & PRIO), open monthly forecasts",
    quantity: "per country-month: probability of >= 25 battle-related deaths in state-based armed conflict, and predicted fatalities",
    not_comparable_note: "Different quantity from Escalation Ledger's P(this crisis reaches full-scale war). Shown for context only; not blended.",
    attacker, defender,
  };
}
