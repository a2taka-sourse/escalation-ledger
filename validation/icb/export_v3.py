#!/usr/bin/env python3
"""Export the frozen v3 model for the app: same data, features and objective as fit_v3.py (deterministic re-fit), plus
- data/model_v3.json: standardisation, slopes, cut points, feature names
- data/icb_history.json: compact as-of history (year, defender code, trigger code, viol) for rivalry features
- data/cow_names.json: COW code <-> state name/abbreviation for name lookup
- data/py_v3_holdout.json: per-case P(war) for the JS parity test
Checks that the re-fit reproduces the pre-registered holdout log-likelihood."""
import csv, json, math
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
src = (HERE / "screen_v3.py").read_text(encoding="utf-8").split("DEC = [")[0]
ns = {"__file__": str(HERE / "screen_v3.py")}
exec(compile(src, "screen_v3_helpers", "exec"), ns)
cases, Y, info, feats, design, ll, raw = (ns[k] for k in ("cases", "Y", "info", "feats", "design", "ll", "raw"))

train = [c for c in cases if c["split"] == "train"]; hold = [c for c in cases if c["split"] == "holdout"]
Xtr = np.array([feats(c, True) for c in train]); mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-9
Xn = design(Xtr, mu, sd)[:, 1:]; v = np.array([info[c["id"]]["viol"] for c in train]); k = Xn.shape[1]; l2 = 10.0

def unpack(t): return t[:k], np.cumsum(np.r_[t[k], np.exp(t[k + 1:k + 3])])
def nll(t):  # identical objective and start point to screen_v3.fit_ordinal
    b, cuts = unpack(t); eta = Xn @ b
    cdf = lambda c: 1 / (1 + np.exp(-(c - eta)))
    P = np.stack([cdf(cuts[0]), cdf(cuts[1]) - cdf(cuts[0]), cdf(cuts[2]) - cdf(cuts[1]), 1 - cdf(cuts[2])], 1)
    return float(-np.sum(np.log(np.clip(P[np.arange(len(v)), v - 1], 1e-9, 1))) + 0.5 * l2 * np.sum(b ** 2))
t = minimize(nll, np.r_[np.zeros(k), -1.0, 0.0, 0.0], method="L-BFGS-B").x
b, cuts = unpack(t)

Xho = design(np.array([feats(c, True) for c in hold]), mu, sd)[:, 1:]
p = 1 - 1 / (1 + np.exp(-(cuts[2] - Xho @ b)))
yho = np.array([Y[c["id"]]["war"] for c in hold])
print("re-fit holdout log-lik", round(ll(p, yho), 3), "(pre-registered result -81.84)")

cols = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10", "J9", "POWDIS50", "pair_crises_log", "pair_war_share", "def_crises_log", "def_war_share"]
(HERE / "data/model_v3.json").write_text(json.dumps({"frozen_from": "PREREG_v3.md", "type": "ordinal logit on ICB VIOL 1-4, P(VIOL=4)",
    "cols": cols, "mu": mu.tolist(), "sd": sd.tolist(), "b": b.tolist(), "cuts": cuts.tolist(), "l2": l2,
    "holdout": {"loglik": round(ll(p, yho), 3)}}, indent=1), encoding="utf-8")
hist = [[int(r["yrtrig"] or r["systrgyr"]), r["cracid"], r["trigent"], int(r["viol"])] for r in raw if (r["yrtrig"] or r["systrgyr"]) and r["viol"] in ("1", "2", "3", "4")]
(HERE / "data/icb_history.json").write_text(json.dumps({"source": "ICB v16 actor-level (Brecher, Wilkenfeld et al.), fields: trigger year, crisis actor COW code, triggering entity code, VIOL",
    "rows": hist}), encoding="utf-8")
cow = list(csv.DictReader(open(HERE.parent.parent / "data/icb_raw/cow_codes.csv", encoding="utf-8")))
names = {}
for r in cow: names.setdefault(r["CCode"], {"abb": r["StateAbb"], "name": r["StateNme"]})
(HERE / "data/cow_names.json").write_text(json.dumps(names, indent=0), encoding="utf-8")
(HERE / "data/py_v3_holdout.json").write_text(json.dumps({c["id"]: float(pp) for c, pp in zip(hold, p)}), encoding="utf-8")
print("exported model_v3.json, icb_history.json (", len(hist), "rows ), cow_names.json (", len(names), "states )")
