#!/usr/bin/env python3
"""Re-run the 下腦 war-judgment v04 frozen-holdout protocol with Jev served by OpenCode Zen (jev-1.13-free).

Nothing in the original project is modified. Output goes to out/90_inverse/east_20260920/war/v04_zen/.
  stage jev      : 19 events x 3 runs with the new Jev (outcome-blind state, identical questions; boolean -> noul)
  stage freeze   : fit on the 11 training events only, freeze (same code as v04)
  stage holdout  : predict the 8 unseen events without refitting (+ baselines)
  stage swap     : September frozen variables (v04/frozen.json) with the NEW Jev answers -> holdout (drop-in check)

Run with the NeuralGCM project venv:
  <proj>/.venv/Scripts/python.exe validation/v04_zen.py --stage jev|freeze|holdout|swap
"""
import argparse, json, math, os, shutil, sys, urllib.request
from pathlib import Path

PROJ = Path(os.environ.get("NGCM_PROJ", "../ngcm"))  # private 下腦 project (ngcm_war_game.py, ngcm_war_v04.py); not in this repo
sys.path.insert(0, str(PROJ))
os.chdir(PROJ)
import numpy as np
import ngcm_inverse_jev as J
import ngcm_war_game as WG
import ngcm_war_v04 as V

ZEN = "https://opencode.ai/zen/v1/systemone"
MODEL = "jev-1.13-free"


def zen_key():
    p = Path(os.path.expanduser("~")) / ".local" / "share" / "opencode" / "auth.json"
    return json.loads(p.read_text(encoding="utf-8"))["opencode"]["key"]


def zen_post(body, timeout=180):
    body = dict(body)
    body.pop("_key", None)
    body["model"] = MODEL
    q = {k: (dict(v, type="noul") if v.get("type") == "boolean" else v) for k, v in body["questions"].items()}
    body["questions"] = q
    req = urllib.request.Request(ZEN, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                                 headers={"Authorization": "Bearer " + zen_key(), "Content-Type": "application/json",
                                          "User-Agent": "ngcm-war-v04-zen/1.0"})  # honest client name; default Python-urllib UA gets 403
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read().decode("utf-8"))
    # normalise the TypeSafe-native noul answer to the shape v04 reads ("probability")
    for k, a in d.get("answers", {}).items():
        if isinstance(a, dict) and "noul" in a and "probability" not in a:
            a["probability"] = a["noul"]
    return d


J.post = zen_post
J.read_key = lambda: "zen"
J.MODEL = MODEL

SRC = V.OUT
V.OUT = WG.OUT / "v04_zen"
V.OUT.mkdir(parents=True, exist_ok=True)
for f in ("world.json", "masks.npz"):          # the world stage is unchanged; reuse it
    if not (V.OUT / f).exists():
        shutil.copy2(SRC / f, V.OUT / f)


def stage_swap():
    world, cache, jvs = V.load_all()
    fz = json.loads((SRC / "frozen.json").read_text(encoding="utf-8"))
    th = np.array(fz["変数"])
    rows = V.per_event(V.HOLDOUT, world, jvs, th)
    ll = round(sum(math.log(r["史実の確率"]) for r in rows), 3)
    old = json.loads((SRC / "holdout.json").read_text(encoding="utf-8"))
    res = {"説明": "9月の凍結変数のまま、Jev の答えだけ jev-1.13-free に入れ替えて見ていない8件を当てる",
           "本体（9月の変数・新しいJev）": ll, "9月の本体": old["本体（凍結）"], "いつも半々": old["いつも半々"],
           "史実ごと": rows}
    (V.OUT / "swap.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print("swap: new-Jev %.2f | September %.2f | coin-flip %.2f" % (ll, old["本体（凍結）"], old["いつも半々"]), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", required=True, choices=["jev", "freeze", "holdout", "swap"])
    a = ap.parse_args()
    {"jev": V.stage_jev, "freeze": V.stage_freeze, "holdout": V.stage_holdout, "swap": stage_swap}[a.stage]()


if __name__ == "__main__":
    main()
