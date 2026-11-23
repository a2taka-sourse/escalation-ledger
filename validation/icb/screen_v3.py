#!/usr/bin/env python3
"""Train-only screening of v3 ideas borrowed from the horse-racing ML work (no holdout use, no new Jev calls).
Metric: leave-one-decade-out CV log-likelihood on 1918-1989 (same as v2's secondary metric: v2 -250.2, power-only -269.8, base -268.6).
Ideas: rivalry history (as-of), ordinal outcome (VIOL 1-4), recency weights, Benter-style blend with power-only, gradient boosting."""
import csv, json, math
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
RAW = HERE.parent.parent / "data" / "icb_raw"
cases = [json.loads(l) for l in (HERE / "data/cases_v2.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
jev = json.loads((HERE / "data/jev.json").read_text(encoding="utf-8"))["items"]
Y = json.loads((HERE / "data/outcomes_v2.json").read_text(encoding="utf-8"))
raw = list(csv.DictReader(open(RAW / "icb2_v16.csv", encoding="utf-8-sig")))
ITEMS = ["J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10"]
train = [c for c in cases if c["split"] == "train"]

# rebuild defender/attacker codes + VIOL for each case id (same selection as build_dataset_v2)
info, seen = {}, {}
for d in raw:
    if d["trigent"] in ("995", "996", "997", "") or d["viol"] not in ("1", "2", "3", "4"):
        continue
    try: int(d["powdis"])
    except ValueError: continue
    cid = f"{d['crisno']}-{d['cracid']}"; seen[cid] = seen.get(cid, 0) + 1
    if seen[cid] > 1: cid = f"{cid}-{seen[cid]}"
    info[cid] = {"D": d["cracid"], "A": d["trigent"], "year": int(d["yrtrig"] or d["systrgyr"]), "viol": int(d["viol"]), "crisno": d["crisno"]}

# as-of rivalry history from ALL ICB2 rows with a strictly earlier trigger year (no same-year leakage)
hist = [(int(r["yrtrig"] or r["systrgyr"] or 0), r["cracid"], r["trigent"], r["viol"]) for r in raw if (r["yrtrig"] or r["systrgyr"])]
def rivalry(D, A, year):
    pair = [h for h in hist if h[0] < year and {h[1], h[2]} == {D, A}]
    dpast = [h for h in hist if h[0] < year and h[1] == D]
    return [math.log1p(len(pair)), sum(h[3] == "4" for h in pair) / (len(pair) + 1),   # pair crises, pair war share (smoothed)
            math.log1p(len(dpast)), sum(h[3] == "4" for h in dpast) / (len(dpast) + 2)] # defender crises, defender war share

def feats(c, extra):
    runs = [jev[f"{c['id']}#{r}"]["answers"] for r in range(3)]
    x = [float(np.mean([a[k]["score"] for a in runs])) for k in ITEMS]
    x.append(float(np.mean([a["J9"].get("noul", 0.5) for a in runs])))
    x.append(c["game"]["powdis"] / 50)
    if extra: x += rivalry(info[c["id"]]["D"], info[c["id"]]["A"], info[c["id"]]["year"])
    return x

def design(X, mu, sd): return np.hstack([np.ones((len(X), 1)), (X - mu) / sd])

def fit_logit(X, y, l2, w=None):
    w = np.ones(len(y)) if w is None else w
    def f(b): z = X @ b; return float(np.sum(w * (np.logaddexp(0, z) - y * z)) + 0.5 * l2 * np.sum(b[1:] ** 2))
    def g(b): p = 1 / (1 + np.exp(-(X @ b))); gr = X.T @ (w * (p - y)); gr[1:] += l2 * b[1:]; return gr
    return minimize(f, np.zeros(X.shape[1]), jac=g, method="L-BFGS-B").x

def fit_ordinal(X, v, l2, w=None):
    """proportional-odds model on VIOL 1..4 (3 cut points); returns P(VIOL=4) predictor"""
    w = np.ones(len(v)) if w is None else w
    Xn = X[:, 1:]; k = Xn.shape[1]
    def unpack(t): return t[:k], np.cumsum(np.r_[t[k], np.exp(t[k + 1:k + 3])])
    def nll(t):
        b, cuts = unpack(t); eta = Xn @ b
        cdf = lambda c: 1 / (1 + np.exp(-(c - eta)))
        P = np.stack([cdf(cuts[0]), cdf(cuts[1]) - cdf(cuts[0]), cdf(cuts[2]) - cdf(cuts[1]), 1 - cdf(cuts[2])], 1)
        return float(-np.sum(w * np.log(np.clip(P[np.arange(len(v)), v - 1], 1e-9, 1))) + 0.5 * l2 * np.sum(b ** 2))
    t = minimize(nll, np.r_[np.zeros(k), -1.0, 0.0, 0.0], method="L-BFGS-B").x
    b, cuts = unpack(t)
    return lambda Xt: 1 - 1 / (1 + np.exp(-(cuts[2] - Xt[:, 1:] @ b)))

def ll(p, y): p = np.clip(p, 1e-6, 1 - 1e-6); return float(np.sum(y * np.log(p) + (1 - y) * np.log(1 - p)))

DEC = [(1918, 1929), (1930, 1939), (1940, 1949), (1950, 1959), (1960, 1969), (1970, 1979), (1980, 1989)]
def decade_cv(predict_fn):
    tot = 0.0; oof = {}
    for a, b in DEC:
        te = [c for c in train if a <= c["year"] <= b]; tr = [c for c in train if not (a <= c["year"] <= b)]
        p = predict_fn(tr, te); tot += ll(p, np.array([Y[c["id"]]["war"] for c in te]))
        for c, pp in zip(te, p): oof[c["id"]] = pp
    return tot, oof

def logit_model(extra=False, l2=10, tau=None, ordinal=False):
    def run(tr, te):
        Xtr = np.array([feats(c, extra) for c in tr]); Xte = np.array([feats(c, extra) for c in te])
        mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-9
        w = None if tau is None else np.exp((np.array([c["year"] for c in tr]) - 1989) / tau)
        if ordinal:
            return fit_ordinal(design(Xtr, mu, sd), np.array([info[c["id"]]["viol"] for c in tr]), l2, w)(design(Xte, mu, sd))
        b = fit_logit(design(Xtr, mu, sd), np.array([Y[c["id"]]["war"] for c in tr]), l2, w)
        return 1 / (1 + np.exp(-(design(Xte, mu, sd) @ b)))
    return run

def power_only(tr, te):
    X = lambda cs: np.array([[1.0, c["game"]["powdis"] / 50] for c in cs])
    b = fit_logit(X(tr), np.array([Y[c["id"]]["war"] for c in tr]), 0.0)
    return 1 / (1 + np.exp(-(X(te) @ b)))

def base_rate(tr, te): return np.full(len(te), np.mean([Y[c["id"]]["war"] for c in tr]))

res = {}
res["base rate"], _ = decade_cv(base_rate)
res["power only"], oof_pow = decade_cv(power_only)
res["v2 (Jev + power)"], oof_v2 = decade_cv(logit_model())
res["+ rivalry history"], _ = decade_cv(logit_model(extra=True))
res["ordinal VIOL 1-4"], _ = decade_cv(logit_model(ordinal=True))
res["ordinal + rivalry"], _ = decade_cv(logit_model(extra=True, ordinal=True))
for tau in (15, 30):
    res[f"recency weights tau={tau}y"], _ = decade_cv(logit_model(tau=tau))
    res[f"rivalry + recency tau={tau}y"], _ = decade_cv(logit_model(extra=True, tau=tau))

# Benter-style blend: logit p = a*logit(v2) + b*logit(power) + c, fitted on OOF predictions (nested by decade)
lg = lambda p: np.log(np.clip(p, 1e-6, 1 - 1e-6) / (1 - np.clip(p, 1e-6, 1 - 1e-6)))
def blend(tr, te):
    Z = lambda cs: np.array([[1.0, lg(oof_v2[c["id"]]), lg(oof_pow[c["id"]])] for c in cs])
    b = fit_logit(Z(tr), np.array([Y[c["id"]]["war"] for c in tr]), 0.0)
    return 1 / (1 + np.exp(-(Z(te) @ b)))
res["Benter blend v2 x power (OOF)"], _ = decade_cv(blend)

try:
    from sklearn.ensemble import HistGradientBoostingClassifier
    def gbm(tr, te):
        m = HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200, l2_regularization=1.0, min_samples_leaf=20, random_state=0)
        m.fit(np.array([feats(c, True) for c in tr]), np.array([Y[c["id"]]["war"] for c in tr]))
        return m.predict_proba(np.array([feats(c, True) for c in te]))[:, 1]
    res["gradient boosting + rivalry"], _ = decade_cv(gbm)
except Exception as e:
    res["gradient boosting + rivalry"] = f"skipped: {e}"

# cluster bootstrap (by crisis) CI for the difference v2 - base rate on decade-CV predictions
_, oof_base = decade_cv(base_rate)
ids = [c["id"] for c in train]; crises = sorted({info[i]["crisno"] for i in ids})
by = {k: [i for i in ids if info[i]["crisno"] == k] for k in crises}
rng = np.random.default_rng(0); diffs = []
for _ in range(1000):
    pick = [i for k in rng.choice(crises, len(crises)) for i in by[k]]
    y = np.array([Y[i]["war"] for i in pick])
    diffs.append(ll(np.array([oof_v2[i] for i in pick]), y) - ll(np.array([oof_base[i] for i in pick]), y))
res["bootstrap 95% CI of (v2 - base) decade-CV log-lik"] = [round(float(np.percentile(diffs, 2.5)), 1), round(float(np.percentile(diffs, 97.5)), 1)]

out = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in res.items()}
(HERE / "data/screen_v3.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
for k, v in out.items(): print(f"{k:45s} {v}")
