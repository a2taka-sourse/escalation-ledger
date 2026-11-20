#!/usr/bin/env python3
"""Build the ICB real-world test set for the war-judgment game (pre-registered in PREREG.md).

Unit: one ICB2 crisis actor D (the threatened state) and the single state A that triggered its crisis (TRIGENT).
Rows with non-state / internal / multi-state triggers (995/996/997) are dropped.
Outputs (outcomes are kept in a SEPARATE file so the Jev stage never reads them):
  cases.jsonl     id, crisno, split, game inputs, anonymised outcome-blind situation text
  outcomes.json   id -> {"war": 0/1} (D's VIOL == 4, full-scale war)
"""
import csv, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE.parent.parent / "data" / "icb_raw"
OUT = HERE / "data"
OUT.mkdir(exist_ok=True)

rows = list(csv.DictReader(open(RAW / "icb2_v16.csv", encoding="utf-8-sig")))
by_crisis_actor = {(r["crisno"], r["cracid"]): r for r in rows}
by_actor = {}
for r in rows:
    by_actor.setdefault(r["cracid"], []).append(r)

TRIGGR = {"1": "a verbal act (protest, threat, accusation or demand)", "2": "a political act (subversion, hostile alliance, sanctions, broken treaty)",
          "3": "an economic act (embargo, nationalisation, aid withheld)", "4": "an external change (new weapon system, intelligence report)",
          "5": "another non-violent act", "6": "an internal challenge to the regime", "7": "a non-violent military act (show of force, mobilisation, manoeuvres)",
          "8": "an indirect violent act (violence against an ally or a revolt abroad)", "9": "a violent act (attack, border clash, invasion)"}
ISSUE = {"1": "military-security (territory, borders, military balance)", "2": "political-diplomatic (sovereignty, hegemony, status)",
         "3": "economic-developmental (resources, property, economic pressure)", "4": "cultural-status (ideology, regime, non-material values)", "5": "other"}
PC = {"1": "not part of a protracted conflict", "2": "part of a protracted conflict between the parties", "3": "part of a long-war protracted conflict"}
REGIME = {"1": "a democracy", "2": "a civil authoritarian regime", "3": "a military regime (direct)", "4": "a military regime (indirect)",
          "5": "a military regime (dual authority)", "6": "an emerging or unstable regime", "7": "a monarchy"}
NUCLEAR = {"1": "no nuclear capability", "2": "a foreseeable nuclear capability", "3": "nuclear weapons without second strike", "4": "a full second-strike nuclear capability"}
ALLY = {"1": "non-aligned", "2": "informally allied with a great power", "3": "formally allied with a great power", "4": "itself a great-power alliance leader", "5": "member of a regional alliance"}
TERRIT = {"1": "small territory", "2": "medium territory", "3": "large territory"}
AGE = {"1": "an old state (pre-1648)", "2": "an old state (1648-1814)", "3": "a state formed 1815-1918", "4": "a state formed 1919-1945",
       "5": "a state formed 1946-1957", "6": "a state formed 1958-1966", "7": "a state formed 1967-1989", "8": "a state formed after 1989"}
SIZEDU = {"1": "a small (1-4 person) decision group", "2": "a medium (5-10) decision group", "3": "a large (10+) decision group"}


def era_of(year):
    return "e4" if year <= 1945 else "e5"


def era_text(year):
    return "the interwar / Second World War era" if year <= 1945 else ("the Cold War era" if year <= 1989 else "the post-Cold War era")


def dist_km(a_loc, d_loc):
    """Pre-registered coarse distance from A's region to D's region (ICB ACTLOC codes)."""
    if not a_loc or not d_loc:
        return 1500.0
    if a_loc == d_loc:
        return 300.0
    if a_loc[0] == d_loc[0]:
        return 1500.0
    return 6000.0


def describe(side, r):
    if r is None:
        return f"{side}: attributes not coded."
    parts = [REGIME.get(r["regime"]), AGE.get(r["age"]), TERRIT.get(r["territ"]), NUCLEAR.get(r["nuclear"]), ALLY.get(r["allycap"])]
    return f"{side}: " + ", ".join(p for p in parts if p) + "."


def power_text(powdis):
    if powdis is None:
        return "Relative power is not coded."
    if abs(powdis) <= 2:
        return "The two sides are roughly equal in overall power (population, economy, territory, alliances, military spending, nuclear)."
    stronger = "the defender" if powdis > 0 else "the attacker"
    size = "much" if abs(powdis) >= 30 else ("clearly" if abs(powdis) >= 8 else "somewhat")
    return f"Overall power (population, economy, territory, alliances, military spending, nuclear) is {size} in favour of {stronger}."


seen = {}
cases, outcomes, dropped = [], {}, {"non-state trigger": 0, "no outcome": 0, "no power score": 0}
for d in rows:
    if d["trigent"] in ("995", "996", "997", ""):
        dropped["non-state trigger"] += 1
        continue
    if d["viol"] not in ("1", "2", "3", "4"):
        dropped["no outcome"] += 1
        continue
    try:
        powdis = int(d["powdis"])
    except ValueError:
        dropped["no power score"] += 1
        continue
    year = int(d["yrtrig"] or d["systrgyr"])
    a = by_crisis_actor.get((d["crisno"], d["trigent"]))
    if a is None:  # trigger state was not itself a crisis actor in this crisis: use its closest earlier ICB record
        prior = [r for r in by_actor.get(d["trigent"], []) if int(r["yrtrig"] or r["systrgyr"] or 0) <= year]
        a = max(prior, key=lambda r: int(r["yrtrig"] or 0)) if prior else None
    cid = f"{d['crisno']}-{d['cracid']}"
    seen[cid] = seen.get(cid, 0) + 1
    if seen[cid] > 1:
        cid = f"{cid}-{seen[cid]}"  # v2: duplicate actor rows in one crisis get their own id
    state = {
        "situation": (f"A crisis in {era_text(year)}. The defender (the state that perceives the crisis) was triggered by "
                      f"{TRIGGR.get(d['triggr'], 'an unspecified act')} from the attacker (a state). "
                      f"The main issue for the defender is {ISSUE.get(d['issue'], 'not coded')}. The dispute is {PC.get(d['pc'], 'of unknown setting')}. "
                      f"{'The two states are in the same region.' if (a and a['actloc'] == d['actloc']) else ('The two states are on the same continent.' if (a and a['actloc'][:1] == d['actloc'][:1]) else 'The two states are far apart.')}"),
        "attacker": describe("Attacker", a),
        "defender": describe("Defender", d) + (" Its response was made by " + SIZEDU[d["sizedu"]] + "." if d["sizedu"] in SIZEDU else ""),
        "power": power_text(powdis),
        "note": "Country names and years are withheld. No outcome is given. Judge only from the situation described.",
    }
    cases.append({
        "id": cid, "crisno": int(d["crisno"]), "year": year, "split": "train" if year <= 1989 else "holdout",
        "game": {"era": era_of(year), "powdis": powdis, "distA_km": dist_km(a["actloc"] if a else None, d["actloc"]), "distD_km": 0.0},
        "features": {k: d[k] for k in ("triggr", "issue", "pc", "regime", "nuclear", "allycap", "territ", "age")} | {"powdis": powdis,
                     "a_regime": a["regime"] if a else "", "a_nuclear": a["nuclear"] if a else "", "same_region": int(bool(a and a["actloc"] == d["actloc"]))},
        "state": state,
    })
    outcomes[cid] = {"war": int(d["viol"] == "4")}

(OUT / "cases_v2.jsonl").write_text("\n".join(json.dumps(c, ensure_ascii=False) for c in cases) + "\n", encoding="utf-8")
(OUT / "outcomes_v2.json").write_text(json.dumps(outcomes, indent=0), encoding="utf-8")
tr = [c for c in cases if c["split"] == "train"]; ho = [c for c in cases if c["split"] == "holdout"]
print("cases", len(cases), "| train", len(tr), "| holdout", len(ho), "| dropped", dropped)
print("example state:", json.dumps(cases[len(cases) // 2]["state"], ensure_ascii=False, indent=1))
