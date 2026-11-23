#!/usr/bin/env python3
"""Build src/model/ucdp_context.json from UCDP downloads (CC BY 4.0, https://ucdp.uu.se/downloads/).

Usage: py -I scripts/build_ucdp.py <Dyadic_v26_1.csv> <out.json> <GEDEvent candidate csv> [more candidate csv ...]
- Dyadic 26.1: interstate armed-conflict dyad-years (type_of_conflict 2), 1946-2025, keyed by the pair of Gleditsch-Ward codes.
- Candidate GED (monthly, preliminary): state-based events (type_of_violence 1) per country-month and per pair of governments.
"""
import csv, json, sys
from collections import defaultdict
from pathlib import Path

dyadic, out, cands = sys.argv[1], sys.argv[2], sys.argv[3:]
csv.field_size_limit(1 << 24)
codes = lambda s: [int(x) for x in str(s).replace(" ", "").split(",") if x.strip().isdigit()]

pairs = defaultdict(list)
with open(dyadic, encoding="utf-8", newline="") as f:
    for r in csv.DictReader(f):
        if r["type_of_conflict"] != "2":
            continue
        for a in codes(r["gwno_a"]):
            for b in codes(r["gwno_b"]):
                k = "-".join(map(str, sorted((a, b))))
                pairs[k].append({"year": int(r["year"]), "intensity": int(r["intensity_level"]), "conflict_id": int(r["conflict_id"]),
                                 "location": r["location"], "side_a": r["side_a"], "side_b": r["side_b"]})
for k in pairs:
    pairs[k].sort(key=lambda x: x["year"])

country = defaultdict(lambda: defaultdict(lambda: {"events": 0, "deaths_best": 0}))
pair_m = defaultdict(lambda: defaultdict(lambda: {"events": 0, "deaths_best": 0}))
months, ids, status = set(), set(), defaultdict(int)
for path in cands:
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            if r["id"] in ids:  # files may overlap
                continue
            ids.add(r["id"])
            if r["type_of_violence"] != "1":
                continue
            m = r["date_start"][:7]; months.add(m); status[r.get("code_status", "")] += 1
            best = int(float(r["best"] or 0))
            for c in codes(r["country_id"]):
                country[str(c)][m]["events"] += 1; country[str(c)][m]["deaths_best"] += best
            ga, gb = codes(r.get("gwnoa", "")), codes(r.get("gwnob", ""))
            for a in ga:
                for b in gb:
                    k = "-".join(map(str, sorted((a, b))))
                    pair_m[k][m]["events"] += 1; pair_m[k][m]["deaths_best"] += best

res = {
    "source": {
        "dyadic": "UCDP Dyadic Dataset version 26.1 (Harbom, Melander & Wallensteen 2008; Davies et al. 2025). Interstate dyads only.",
        "candidate": "UCDP Candidate Events Dataset (Hegre et al. 2020), monthly preliminary releases: " + ", ".join(Path(p).name for p in cands),
        "licence": "CC BY 4.0 — https://ucdp.uu.se/downloads/",
        "codes": "Gleditsch-Ward country codes",
        "candidate_months": sorted(months), "candidate_state_based_events_by_code_status": dict(status),
    },
    "interstate_dyad_years": dict(pairs),
    "candidate_state_based_by_country_month": {k: dict(v) for k, v in country.items()},
    "candidate_state_based_by_government_pair_month": {k: dict(v) for k, v in pair_m.items()},
}
Path(out).write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(json.dumps({"pairs": len(pairs), "countries": len(country), "gov_pairs": len(pair_m), "months": sorted(months), "status": dict(status),
                  "bytes": Path(out).stat().st_size}, indent=1))
