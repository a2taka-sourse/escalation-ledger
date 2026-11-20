#!/usr/bin/env python3
"""v2 probability layer: L2 logistic on Jev 10 items + POWDIS. Implements PREREG_v2.md exactly. Writes data/result_v2.json and
data/model_v2.json (the frozen coefficients the app uses)."""
import hashlib, json, math, time
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
cases = [json.loads(l) for l in (HERE / "data/cases_v2.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
jev = json.loads((HERE / "data/jev.json").read_text(encoding="utf-8"))["items"]
Y = json.loads((HERE / "data/outcomes_v2.json").read_text(encoding="utf-8"))
ITEMS = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10"]
GRID = [0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100]


def feats(c):
    runs = [jev[f"{c['id']}#{r}"]["answers"] for r in range(3)]
    x = {k: float(np.mean([a[k]["score"] for a in runs])) for k in ITEMS}
    x["J9"] = float(np.mean([a["J9"].get("noul", 0.5) for a in runs]))
    x["POWDIS50"] = c["game"]["powdis"] / 50
    return x


F = {c["id"]: feats(c) for c in cases}
train = [c for c in cases if c["split"] == "train"]
hold = [c for c in cases if c["split"] == "holdout"]
SETS = {"v2 (Jev items + POWDIS)": ITEMS + ["J9", "POWDIS50"], "Jev items only": ITEMS + ["J9"], "power only": ["POWDIS50"]}


def mat(cs, cols, mu=None, sd=None):
    X = np.array([[F[c["id"]][k] for k in cols] for c in cs])
    if mu is None:
        mu, sd = X.mean(0), X.std(0) + 1e-9
    return np.hstack([np.ones((len(cs), 1)), (X - mu) / sd]), mu, sd


def fit(X, y, l2):
    def f(w):
        z = X @ w
        return float(np.sum(np.logaddexp(0, z) - y * z) + 0.5 * l2 * np.sum(w[1:] ** 2))

    def g(w):
        p = 1 / (1 + np.exp(-(X @ w)))
        gr = X.T @ (p - y); gr[1:] += l2 * w[1:]
        return gr
    return minimize(f, np.zeros(X.shape[1]), jac=g, method="L-BFGS-B").x


def ll(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(np.sum(y * np.log(p) + (1 - y) * np.log(1 - p)))


def auc(p, y):
    pos, neg = p[y == 1], p[y == 0]
    return float(np.mean([(a > b) + 0.5 * (a == b) for a in pos for b in neg]))


def cv_penalty(cs, cols):
    y = np.array([Y[c["id"]]["war"] for c in cs])
    rng = np.random.default_rng(0)
    folds = np.zeros(len(cs), int)
    for cls in (0, 1):
        idx = np.where(y == cls)[0]; rng.shuffle(idx)
        folds[idx] = np.arange(len(idx)) % 5
    best = None
    for l2 in GRID:
        tot = 0.0
        for k in range(5):
            tr, te = [c for c, f in zip(cs, folds) if f != k], [c for c, f in zip(cs, folds) if f == k]
            Xtr, mu, sd = mat(tr, cols); Xte, _, _ = mat(te, cols, mu, sd)
            w = fit(Xtr, y[folds != k], l2)
            tot += ll(1 / (1 + np.exp(-(Xte @ w))), y[folds == k])
        if best is None or tot > best[1]:
            best = (l2, tot)
    return best[0]


def train_predict(tr, te, cols):
    ytr = np.array([Y[c["id"]]["war"] for c in tr])
    l2 = cv_penalty(tr, cols)
    Xtr, mu, sd = mat(tr, cols); Xte, _, _ = mat(te, cols, mu, sd)
    w = fit(Xtr, ytr, l2)
    return 1 / (1 + np.exp(-(Xte @ w))), {"l2": l2, "w": w.tolist(), "mu": mu.tolist(), "sd": sd.tolist(), "cols": cols}


def metrics(p, y):
    q = np.quantile(p, [0.25, 0.5, 0.75])
    bins = np.digitize(p, q)
    cal = [{"quartile": int(b) + 1, "n": int((bins == b).sum()), "mean_pred": round(float(p[bins == b].mean()), 3),
            "war_rate": round(float(y[bins == b].mean()), 3)} for b in range(4) if (bins == b).any()]
    return {"loglik": round(ll(p, y), 3), "per_case": round(ll(p, y) / len(y), 4), "brier": round(float(np.mean((p - y) ** 2)), 4),
            "auc": round(auc(p, y), 4), "calibration": cal}


t0 = time.time()
ytr = np.array([Y[c["id"]]["war"] for c in train]); yho = np.array([Y[c["id"]]["war"] for c in hold])
res = {"prereg_sha256": hashlib.sha256((HERE / "PREREG_v2.md").read_bytes()).hexdigest(), "holdout": {}, "decade_cv_train": {}}
models = {}
for name, cols in SETS.items():
    p, m = train_predict(train, hold, cols)
    res["holdout"][name] = metrics(p, yho); models[name] = m
res["holdout"]["base rate"] = metrics(np.full(len(hold), ytr.mean()), yho)
res["holdout"]["_war_rate"] = round(float(yho.mean()), 4)

# pre-specified secondary: leave-one-decade-out on TRAIN
decades = [(1918, 1929), (1930, 1939), (1940, 1949), (1950, 1959), (1960, 1969), (1970, 1979), (1980, 1989)]
for name, cols in list(SETS.items()) + [("base rate", None)]:
    tot = 0.0
    for a, b in decades:
        te = [c for c in train if a <= c["year"] <= b]; tr = [c for c in train if not (a <= c["year"] <= b)]
        yte = np.array([Y[c["id"]]["war"] for c in te])
        if cols is None:
            p = np.full(len(te), np.mean([Y[c["id"]]["war"] for c in tr]))
        else:
            p, _ = train_predict(tr, te, cols)
        tot += ll(p, yte)
    res["decade_cv_train"][name] = round(tot, 3)

v2, base, powr = (res["holdout"][k]["loglik"] for k in ("v2 (Jev items + POWDIS)", "base rate", "power only"))
res["PASS"] = bool(v2 > base and v2 > powr)
(HERE / "data/result_v2.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
(HERE / "data/model_v2.json").write_text(json.dumps({"frozen_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "trained_on": "ICB v16 crises <=1989 (533)",
    "jev_model": "jev-1.13(-free)", "model": models["v2 (Jev items + POWDIS)"]}, indent=1), encoding="utf-8")
print(json.dumps(res, ensure_ascii=False, indent=1)); print(f"{time.time() - t0:.0f}s")
