#!/usr/bin/env python3
"""Fit on train (<=1989), freeze, then score the 1990-2021 holdout. Implements PREREG.md exactly.
Run with the NeuralGCM venv (numpy/scipy):  <proj>/.venv/Scripts/python.exe fit_stage.py
"""
import hashlib, json, math, os, sys, time
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
PROJ = Path(os.environ.get("NGCM_PROJ", "../ngcm"))  # private 下腦 project providing ngcm_war_game.py (not in this repo)
sys.path.insert(0, str(PROJ))
import ngcm_war_game as WG  # solve_game reused unchanged

cases = [json.loads(l) for l in (HERE / "data/cases.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
jev = json.loads((HERE / "data/jev.json").read_text(encoding="utf-8"))["items"]
y_all = json.loads((HERE / "data/outcomes.json").read_text(encoding="utf-8"))
train = [c for c in cases if c["split"] == "train"]
hold = [c for c in cases if c["split"] == "holdout"]
f2 = lambda x: 2 ** ((x - 2) / 2)


def jv_of(cid):
    runs = [jev[f"{cid}#{r}"]["answers"] for r in range(3)]
    s = {k: float(np.mean([a[k]["score"] for a in runs])) for k in ("J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J10")}
    gen = float(np.mean([a["J9"].get("noul", 0.5) for a in runs]))
    return {"coh": f2(s["J10"]), "wA": f2(s["J1"]), "wD": f2(s["J2"]), "ia": s["J3"] / 4, "cp": s["J4"] / 4, "ind": s["J5"] / 4,
            "priv": s["J6"] / 2, "risk": s["J7"] / 2, "q": f2(s["J8"]), "generic": gen}


JV = {c["id"]: jv_of(c["id"]) for c in cases}
POP = 1e7
PRIOR = np.array([math.log(5), math.log(800), math.log(20)]), np.array([1.5, 0.5, 1.0])


def p_war(c, jv, th):
    lam, Lam, s = math.exp(th[0]), math.exp(th[1]), math.exp(th[2])
    g = c["game"]
    ev = {"時代": g["era"], "種類": "戦争", "A勢力": "A", "D勢力": "D", "T勢力": "T"}
    wr = {"養える人数": {"A": POP * math.exp(-g["powdis"] / s), "D": POP, "T": POP},
          "費用距離_km": {"0.35": {"A": g["distA_km"], "D": g["distD_km"]}}, "険しい割合_T": 0.0, "湿地の割合_T": 0.0}
    r = WG.solve_game(ev, wr, jv, lambda e, f: 1.0, lam, Lam, {})
    return min(max(float(r["戦争"]), 1e-4), 1 - 1e-4)


def ll(ps, ys):
    ps, ys = np.asarray(ps), np.asarray(ys)
    return float(np.sum(ys * np.log(ps) + (1 - ys) * np.log(1 - ps)))


def fit_game(use_jev):
    ys = [y_all[c["id"]]["war"] for c in train]
    jvs = [JV[c["id"]] if use_jev else WG.NEUTRAL for c in train]

    def nlp(th):
        ps = [p_war(c, jv, th) for c, jv in zip(train, jvs)]
        return -ll(ps, ys) + 0.5 * float(np.sum(((th - PRIOR[0]) / PRIOR[1]) ** 2))
    rng = np.random.default_rng(0)
    best = None
    for k in range(6):
        x0 = PRIOR[0] + (0 if k == 0 else rng.normal(0, 1, 3) * PRIOR[1])
        r = minimize(nlp, x0, method="L-BFGS-B")
        if best is None or r.fun < best.fun:
            best = r
    return best.x


def onehot_design(cs, cats=None):
    keys = ("triggr", "issue", "pc", "regime", "nuclear", "allycap", "territ", "age", "a_regime", "a_nuclear")
    if cats is None:
        cats = {k: sorted({c["features"][k] for c in cs}) for k in keys}
    X = []
    for c in cs:
        row = [1.0, c["features"]["powdis"] / 50, float(c["features"]["same_region"])]
        for k in keys:
            row += [1.0 if c["features"][k] == v else 0.0 for v in cats[k][1:]]
        X.append(row)
    return np.array(X), cats


def fit_logit(X, y, l2):
    def nll(w):
        z = X @ w
        return float(np.sum(np.logaddexp(0, z) - y * z) + 0.5 * l2 * np.sum(w[1:] ** 2))

    def grad(w):
        p = 1 / (1 + np.exp(-(X @ w)))
        g = X.T @ (p - y)
        g[1:] += l2 * w[1:]
        return g
    return minimize(nll, np.zeros(X.shape[1]), jac=grad, method="L-BFGS-B").x


def auc(ps, ys):
    ps, ys = np.asarray(ps), np.asarray(ys)
    pos, neg = ps[ys == 1], ps[ys == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    return float(np.mean([(p > n) + 0.5 * (p == n) for p in pos for n in neg]))


def metrics(ps, ys):
    ps, ys = np.clip(np.asarray(ps), 1e-4, 1 - 1e-4), np.asarray(ys)
    return {"loglik": round(ll(ps, ys), 3), "loglik_per_case": round(ll(ps, ys) / len(ys), 4),
            "brier": round(float(np.mean((ps - ys) ** 2)), 4), "auc": round(auc(ps, ys), 4)}


# ---------- fit on train only ----------
t0 = time.time()
y_tr = np.array([y_all[c["id"]]["war"] for c in train])
y_ho = np.array([y_all[c["id"]]["war"] for c in hold])
th_full = fit_game(True)
th_nojev = fit_game(False)
Xtr, cats = onehot_design(train)
Xho, _ = onehot_design(hold, cats)
w_lr = fit_logit(Xtr, y_tr, 1.0)
Ptr = np.array([[1.0, c["features"]["powdis"] / 50] for c in train]); Pho = np.array([[1.0, c["features"]["powdis"] / 50] for c in hold])
w_pow = fit_logit(Ptr, y_tr, 0.0)
base = float(y_tr.mean())

frozen = {"frozen_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
          "prereg_sha256": hashlib.sha256((HERE / "PREREG.md").read_bytes()).hexdigest(),
          "jev_sha256": hashlib.sha256((HERE / "data/jev.json").read_bytes()).hexdigest()[:16],
          "theta_full": {"lambda": math.exp(th_full[0]), "Lambda_km": math.exp(th_full[1]), "s": math.exp(th_full[2])},
          "theta_nojev": {"lambda": math.exp(th_nojev[0]), "Lambda_km": math.exp(th_nojev[1]), "s": math.exp(th_nojev[2])},
          "base_rate_train": base, "n_train": len(train), "n_holdout": len(hold)}
(HERE / "data/frozen.json").write_text(json.dumps(frozen, indent=1), encoding="utf-8")

# ---------- score (train in-sample for reference, holdout = the test) ----------
res = {"frozen": frozen, "train_in_sample": {}, "holdout": {}}
for split, cs, ys, X, P in (("train_in_sample", train, y_tr, Xtr, Ptr), ("holdout", hold, y_ho, Xho, Pho)):
    preds = {
        "full_model (game + Jev)": [p_war(c, JV[c["id"]], th_full) for c in cs],
        "no_jev (game, neutral weights)": [p_war(c, WG.NEUTRAL, th_nojev) for c in cs],
        "power_only (logistic on POWDIS)": list(1 / (1 + np.exp(-(P @ w_pow)))),
        "base_rate": [base] * len(cs),
        "logistic_regression (same coded vars)": list(1 / (1 + np.exp(-(X @ w_lr)))),
    }
    res[split] = {k: metrics(v, ys) for k, v in preds.items()}
    res[split]["_war_rate"] = round(float(ys.mean()), 4)
    if split == "holdout":
        res["holdout_predictions"] = {c["id"]: {k: round(float(v[i]), 4) for k, v in preds.items()} | {"war": int(ys[i])} for i, c in enumerate(cs)}
(HERE / "data/result.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({k: res[k] for k in ("frozen", "train_in_sample", "holdout")}, ensure_ascii=False, indent=1))
print(f"{time.time() - t0:.0f}s")
