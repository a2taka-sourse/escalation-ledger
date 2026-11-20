#!/usr/bin/env python3
"""v2.1: Venn-ABERS calibration (venn-abers 1.5.4) on the frozen v2 layer. Implements PREREG_v2.1.md exactly.
Writes data/result_v2.1.json, data/va_table.json (for the app) and data/py_va_holdout.json (parity test).
Needs numpy, scipy, scikit-learn, and the venn-abers source on sys.path (VENN_ABERS_SRC or .vendor/...)."""
import hashlib, json, os, sys
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
sys.path.insert(0, os.environ.get("VENN_ABERS_SRC", str(HERE / ".vendor/src/venn_abers-1.5.4/src")))
from venn_abers import VennAbers  # noqa: E402

cases = [json.loads(l) for l in (HERE / "data/cases_v2.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
jev = json.loads((HERE / "data/jev.json").read_text(encoding="utf-8"))["items"]
Y = json.loads((HERE / "data/outcomes_v2.json").read_text(encoding="utf-8"))
M = json.loads((HERE / "data/model_v2.json").read_text(encoding="utf-8"))["model"]
COLS, L2 = M["cols"], M["l2"]
ITEMS = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10"]


def feats(c):
    runs = [jev[f"{c['id']}#{r}"]["answers"] for r in range(3)]
    x = {k: float(np.mean([a[k]["score"] for a in runs])) for k in ITEMS}
    x["J9"] = float(np.mean([a["J9"].get("noul", 0.5) for a in runs]))
    x["POWDIS50"] = c["game"]["powdis"] / 50
    return [x[k] for k in COLS]


train = [c for c in cases if c["split"] == "train"]
hold = [c for c in cases if c["split"] == "holdout"]
Xtr = np.array([feats(c) for c in train]); ytr = np.array([Y[c["id"]]["war"] for c in train])
Xho = np.array([feats(c) for c in hold]); yho = np.array([Y[c["id"]]["war"] for c in hold])


def fit(X, y, l2):
    def f(w):
        z = X @ w
        return float(np.sum(np.logaddexp(0, z) - y * z) + 0.5 * l2 * np.sum(w[1:] ** 2))

    def g(w):
        p = 1 / (1 + np.exp(-(X @ w)))
        gr = X.T @ (p - y); gr[1:] += l2 * w[1:]
        return gr
    return minimize(f, np.zeros(X.shape[1]), jac=g, method="L-BFGS-B").x


def design(X, mu, sd):
    return np.hstack([np.ones((len(X), 1)), (X - mu) / sd])


# out-of-fold probabilities on train (fold construction identical to fit_v2.cv_penalty)
rng = np.random.default_rng(0)
folds = np.zeros(len(train), int)
for cls in (0, 1):
    idx = np.where(ytr == cls)[0]; rng.shuffle(idx)
    folds[idx] = np.arange(len(idx)) % 5
oof = np.zeros(len(train))
for k in range(5):
    tr, te = folds != k, folds == k
    mu, sd = Xtr[tr].mean(0), Xtr[tr].std(0) + 1e-9
    w = fit(design(Xtr[tr], mu, sd), ytr[tr], L2)
    oof[te] = 1 / (1 + np.exp(-(design(Xtr[te], mu, sd) @ w)))

# frozen v2 probabilities on the holdout
w2, mu2, sd2 = np.array(M["w"]), np.array(M["mu"]), np.array(M["sd"])
p_raw = 1 / (1 + np.exp(-(design(Xho, mu2, sd2) @ w2)))

va = VennAbers()
va.fit(np.c_[1 - oof, oof], ytr)
p_prime, p0p1 = va.predict_proba(np.c_[1 - p_raw, p_raw])
p_va, p0, p1 = p_prime[:, 1], p0p1[:, 0], p0p1[:, 1]


def ll(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(np.sum(y * np.log(p) + (1 - y) * np.log(1 - p)))


q = np.quantile(p_raw, [0.25, 0.5, 0.75]); bins = np.digitize(p_raw, q)
quart = []
for b in range(4):
    m = bins == b
    rate, lo, hi = float(yho[m].mean()), float(p0[m].mean()), float(p1[m].mean())
    quart.append({"quartile": b + 1, "n": int(m.sum()), "mean_p_raw": round(float(p_raw[m].mean()), 3), "mean_p0": round(lo, 3),
                  "mean_p1": round(hi, 3), "mean_p_va": round(float(p_va[m].mean()), 3), "war_rate": round(rate, 3), "inside": bool(lo <= rate <= hi)})
res = {
    "prereg_sha256": hashlib.sha256((HERE / "PREREG_v2.1.md").read_bytes()).hexdigest(),
    "holdout": {"v2_raw": {"loglik": round(ll(p_raw, yho), 3), "brier": round(float(np.mean((p_raw - yho) ** 2)), 4)},
                "v2.1_venn_abers": {"loglik": round(ll(p_va, yho), 3), "brier": round(float(np.mean((p_va - yho) ** 2)), 4),
                                    "mean_interval_width": round(float(np.mean(p1 - p0)), 4)},
                "quartiles": quart},
    "calibration_set": {"n": len(train), "oof_mean": round(float(oof.mean()), 4), "war_rate": round(float(ytr.mean()), 4)},
}
inside = sum(q_["inside"] for q_ in quart)
res["PASS"] = bool(res["holdout"]["v2.1_venn_abers"]["loglik"] >= res["holdout"]["v2_raw"]["loglik"]
                   and res["holdout"]["v2.1_venn_abers"]["brier"] <= res["holdout"]["v2_raw"]["brier"] and inside >= 3)
(HERE / "data/result_v2.1.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
(HERE / "data/va_table.json").write_text(json.dumps({
    "source": "venn-abers 1.5.4 VennAbers fitted on out-of-fold v2 probabilities of 533 ICB crises (<=1989)",
    "c": va.c_.tolist(), "p0": va.p0_[:, 1].tolist(), "p1": va.p1_[:, 1].tolist(),
    "lookup": "p0 = p0[searchsorted(c, p, 'right')], p1 = p1[searchsorted(c, p, 'left')], merged = p1 / (1 - p0 + p1)"}), encoding="utf-8")
(HERE / "data/py_va_holdout.json").write_text(json.dumps({c["id"]: [float(a), float(b), float(m)] for c, a, b, m in zip(hold, p0, p1, p_va)}), encoding="utf-8")
print(json.dumps(res, indent=1))
