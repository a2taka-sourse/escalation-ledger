#!/usr/bin/env python3
"""Implements PREREG_v3_ordinal.md: frozen v3 scored on all four ICB violence levels vs ordinal base rate and ordinal power-only."""
import hashlib, json
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
src = (HERE / "fit_v3.py").read_text(encoding="utf-8").split("crises = sorted(")[0]
ns = {"__file__": str(HERE / "fit_v3.py")}
exec(compile(src, "fit_v3_head", "exec"), ns)
p3_frozen, train, hold, info, design, feats = (ns[k] for k in ("p3", "train", "hold", "info", "design", "feats"))

def fit_ordinal_full(X, v, l2):
    """identical objective, start point and optimiser as screen_v3.fit_ordinal; returns the full 4-level predictor"""
    Xn = X[:, 1:]; k = Xn.shape[1]; w = np.ones(len(v))
    def unpack(t): return t[:k], np.cumsum(np.r_[t[k], np.exp(t[k + 1:k + 3])])
    def probs(Xm, b, cuts):
        eta = Xm @ b; cdf = lambda c: 1 / (1 + np.exp(-(c - eta)))
        return np.stack([cdf(cuts[0]), cdf(cuts[1]) - cdf(cuts[0]), cdf(cuts[2]) - cdf(cuts[1]), 1 - cdf(cuts[2])], 1)
    def nll(t):
        b, cuts = unpack(t); P = probs(Xn, b, cuts)
        return float(-np.sum(w * np.log(np.clip(P[np.arange(len(v)), v - 1], 1e-9, 1))) + 0.5 * l2 * np.sum(b ** 2))
    t = minimize(nll, np.r_[np.zeros(k), -1.0, 0.0, 0.0], method="L-BFGS-B").x
    b, cuts = unpack(t)
    return lambda Xt: probs(Xt[:, 1:], b, cuts)

vtr = np.array([info[c["id"]]["viol"] for c in train]); vho = np.array([info[c["id"]]["viol"] for c in hold])

# frozen v3, four levels
Xtr = np.array([feats(c, True) for c in train]); Xho = np.array([feats(c, True) for c in hold])
mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-9
P3 = fit_ordinal_full(design(Xtr, mu, sd), vtr, 10.0)(design(Xho, mu, sd))
parity = float(np.max(np.abs(P3[:, 3] - p3_frozen)))
assert parity < 1e-9, f"P(VIOL=4) differs from frozen v3 by {parity}: stop (PREREG_v3_ordinal.md)"

# B0 ordinal base rate; B1 ordinal power-only
P0 = np.tile(np.bincount(vtr, minlength=5)[1:] / len(vtr), (len(hold), 1))
pw = lambda cs: np.array([[c["game"]["powdis"] / 50] for c in cs])
mp, sp = pw(train).mean(0), pw(train).std(0) + 1e-9
P1 = fit_ordinal_full(design(pw(train), mp, sp), vtr, 10.0)(design(pw(hold), mp, sp))

def LL(P, idx=None):
    idx = np.arange(len(vho)) if idx is None else np.asarray(idx)
    return float(np.sum(np.log(np.clip(P[idx, vho[idx] - 1], 1e-9, 1))))
def RPS(P):
    O = np.eye(4)[vho - 1]
    return float(np.mean(np.sum((np.cumsum(P, 1) - np.cumsum(O, 1))[:, :3] ** 2, 1) / 3))

crises = sorted({info[c["id"]]["crisno"] for c in hold}); idx = {k: [i for i, c in enumerate(hold) if info[c["id"]]["crisno"] == k] for k in crises}
rng = np.random.default_rng(0); d0, d1 = [], []
for _ in range(5000):
    pick = [i for k in rng.choice(crises, len(crises)) for i in idx[k]]
    l3 = LL(P3, pick); d0.append(l3 - LL(P0, pick)); d1.append(l3 - LL(P1, pick))
ci = lambda d: [round(float(np.percentile(d, 2.5)), 2), round(float(np.percentile(d, 97.5)), 2)]
res = {"prereg_sha256": hashlib.sha256((HERE / "PREREG_v3_ordinal.md").read_bytes()).hexdigest(),
       "parity_max_abs_diff_P4_vs_frozen": parity, "n": int(len(vho)), "observed_share": (np.bincount(vho, minlength=5)[1:] / len(vho)).round(3).tolist(),
       "loglik": {"v3": round(LL(P3), 2), "B0_base": round(LL(P0), 2), "B1_power": round(LL(P1), 2)},
       "ci95_v3_minus_B0": ci(d0), "ci95_v3_minus_B1": ci(d1),
       "share_gt0": {"v3-B0": round(float(np.mean(np.array(d0) > 0)), 3), "v3-B1": round(float(np.mean(np.array(d1) > 0)), 3)},
       "rps": {"v3": round(RPS(P3), 4), "B0_base": round(RPS(P0), 4), "B1_power": round(RPS(P1), 4)},
       "calibration_mean_pred_vs_obs": {m: [[round(float(P[:, j].mean()), 3), round(float(np.mean(vho == j + 1)), 3)] for j in range(4)] for m, P in (("v3", P3), ("B0", P0), ("B1", P1))}}
res["PASS"] = res["ci95_v3_minus_B0"][0] > 0
(HERE / "data/result_v3_ordinal.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
print(json.dumps(res, indent=1))
