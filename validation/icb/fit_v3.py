#!/usr/bin/env python3
"""v3 = ordinal logit on VIOL 1-4 with v2 features + as-of rivalry history. Implements PREREG_v3.md exactly."""
import hashlib, json, math, runpy, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
# reuse the exact helper definitions from the screening script without re-running its experiments
src = (HERE / "screen_v3.py").read_text(encoding="utf-8").split("DEC = [")[0]
ns = {"__file__": str(HERE / "screen_v3.py")}
exec(compile(src, "screen_v3_helpers", "exec"), ns)
cases, Y, info, feats, design, fit_ordinal, fit_logit, ll = (ns[k] for k in ("cases", "Y", "info", "feats", "design", "fit_ordinal", "fit_logit", "ll"))

train = [c for c in cases if c["split"] == "train"]; hold = [c for c in cases if c["split"] == "holdout"]
Xtr = np.array([feats(c, True) for c in train]); Xho = np.array([feats(c, True) for c in hold])
mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-9
pred = fit_ordinal(design(Xtr, mu, sd), np.array([info[c["id"]]["viol"] for c in train]), 10.0)
p3 = pred(design(Xho, mu, sd))
yho = np.array([Y[c["id"]]["war"] for c in hold])

# v2 holdout predictions (frozen model) for the paired comparison
m2 = json.loads((HERE / "data/model_v2.json").read_text())["model"]
X2 = np.array([feats(c, False) for c in hold])
p2 = 1 / (1 + np.exp(-(np.hstack([np.ones((len(X2), 1)), (X2 - np.array(m2["mu"])) / np.array(m2["sd"])]) @ np.array(m2["w"]))))

def auc(p, y):
    pos, neg = p[y == 1], p[y == 0]
    return float(np.mean([(a > b) + 0.5 * (a == b) for a in pos for b in neg]))
def metrics(p):
    q = np.quantile(p, [0.25, 0.5, 0.75]); bins = np.digitize(p, q)
    return {"loglik": round(ll(p, yho), 3), "brier": round(float(np.mean((p - yho) ** 2)), 4), "auc": round(auc(p, yho), 4),
            "calibration": [{"q": int(b) + 1, "mean_pred": round(float(p[bins == b].mean()), 3), "war_rate": round(float(yho[bins == b].mean()), 3)} for b in range(4)]}

crises = sorted({info[c["id"]]["crisno"] for c in hold}); idx = {k: [i for i, c in enumerate(hold) if info[c["id"]]["crisno"] == k] for k in crises}
rng = np.random.default_rng(0); diffs = []
for _ in range(2000):
    pick = [i for k in rng.choice(crises, len(crises)) for i in idx[k]]
    diffs.append(ll(p3[pick], yho[pick]) - ll(p2[pick], yho[pick]))
res = {"prereg_sha256": hashlib.sha256((HERE / "PREREG_v3.md").read_bytes()).hexdigest(),
       "v3": metrics(p3), "v2": metrics(p2),
       "bootstrap_95ci_v3_minus_v2": [round(float(np.percentile(diffs, 2.5)), 2), round(float(np.percentile(diffs, 97.5)), 2)]}
res["PASS"] = res["v3"]["loglik"] > -87.29
(HERE / "data/result_v3.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
print(json.dumps(res, indent=1))
