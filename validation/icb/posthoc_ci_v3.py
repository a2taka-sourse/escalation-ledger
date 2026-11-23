#!/usr/bin/env python3
"""Post-hoc paired CIs for the frozen v3 holdout predictions vs base rate and power-only.
No refit, no new model: the same predictions as fit_v3.py, compared with the two simple baselines already reported in RESULT_v3.md."""
import json
from pathlib import Path
import numpy as np
HERE = Path(__file__).resolve().parent
src = (HERE / "fit_v3.py").read_text(encoding="utf-8").split("crises = sorted(")[0]
ns = {"__file__": str(HERE / "fit_v3.py")}
exec(compile(src, "fit_v3_head", "exec"), ns)
p3, p2, yho, hold, train, info, ll = (ns[k] for k in ("p3", "p2", "yho", "hold", "train", "info", "ll"))
H = ns["ns"]; Y, fit_logit = H["Y"], H["fit_logit"]
# same definitions as screen_v3.py power_only / base_rate (copied verbatim; they sit after its DEC line)
Xp = lambda cs: np.array([[1.0, c["game"]["powdis"] / 50] for c in cs])
bp = fit_logit(Xp(train), np.array([Y[c["id"]]["war"] for c in train]), 0.0)
pw = 1 / (1 + np.exp(-(Xp(hold) @ bp))); pb = np.full(len(hold), np.mean([Y[c["id"]]["war"] for c in train]))
crises = sorted({info[c["id"]]["crisno"] for c in hold}); idx = {k: [i for i, c in enumerate(hold) if info[c["id"]]["crisno"] == k] for k in crises}
rng = np.random.default_rng(0); D = {"v3-v2": [], "v3-power": [], "v3-base": []}
for _ in range(5000):
    pick = [i for k in rng.choice(crises, len(crises)) for i in idx[k]]
    y = yho[pick]; l3 = ll(p3[pick], y)
    D["v3-v2"].append(l3 - ll(p2[pick], y)); D["v3-power"].append(l3 - ll(pw[pick], y)); D["v3-base"].append(l3 - ll(pb[pick], y))
out = {"point": {"v3": round(ll(p3, yho), 2), "v2": round(ll(p2, yho), 2), "power": round(ll(pw, yho), 2), "base": round(ll(pb, yho), 2)},
       "ci95": {k: [round(float(np.percentile(v, 2.5)), 2), round(float(np.percentile(v, 97.5)), 2)] for k, v in D.items()},
       "share_gt0": {k: round(float(np.mean(np.array(v) > 0)), 3) for k, v in D.items()}}
(HERE / "data/posthoc_ci_v3.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
print(json.dumps(out, indent=1))
