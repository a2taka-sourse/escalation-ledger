#!/usr/bin/env python3
"""Ask Jev (OpenCode Zen jev-1.13-free) the 10 war-judgment questions for every ICB case, 3 runs each.
Reads ONLY data/cases.jsonl (never outcomes). Resumable cache: data/jev.json. No paid fallback: on rate limits it backs off.
"""
import json, os, sys, time, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "data" / "jev.json"
ZEN = "https://opencode.ai/zen/v1/systemone"
MODEL = "jev-1.13-free"
REPS = 3
KEY = json.loads((Path(os.path.expanduser("~")) / ".local/share/opencode/auth.json").read_text(encoding="utf-8"))["opencode"]["key"]

sys.path.insert(0, str(HERE.parent.parent))  # nothing imported from there; questions are inlined below for a frozen copy
Q = {
 "J1": ["For the attacker's ruler, how heavy is the value of obtaining the contested object compared with its tax/economic value (including prestige, security, religion, national aspirations)?", ["much lighter than its economic value", "somewhat lighter", "about equal", "heavier (prestige or security added)", "far heavier (survival or faith at stake)"]],
 "J2": ["For the defender's ruler, how heavy is losing the contested object compared with its tax/economic value (homeland, sacred sites, prestige)?", ["much lighter", "somewhat lighter", "about equal", "heavier", "far heavier (regime survival at stake)"]],
 "J3": ["Are both sides likely to misjudge the other's true strength or resolve (distance, unfamiliar opponent, opaque internal state, new military technology, domestic turmoil)?", ["they know each other well", "slightly prone to misjudge", "moderately prone", "highly prone", "almost nothing is known"]],
 "J4": ["From the attacker's view, is the balance of power likely to shift against it if it waits (rival rising, itself declining), or are negotiated promises unlikely to be kept in future?", ["not at all", "slightly", "moderately", "strongly", "extremely (now or never)"]],
 "J5": ["Is the contested object hard to split through negotiation (sacred site, capital, a single resource, independence itself)?", ["easily divisible", "slightly hard to divide", "moderately hard", "very hard", "indivisible (all or nothing)"]],
 "J6": ["How large are the personal gains the attacker's ruler and inner circle would get from the war itself (territory, wealth, positions to distribute; larger in narrow-coalition regimes)?", ["almost none", "small", "moderate", "large", "very large"]],
 "J7": ["How large is the risk that the attacker's ruler loses position or life if the war is lost?", ["almost none", "small", "moderate", "large", "very large"]],
 "J8": ["Setting troop numbers aside, how does the attacker's military quality (technology, organisation, morale, logistics) compare with the defender's?", ["far inferior", "inferior", "about equal", "superior", "far superior"]],
 "J10": ["Is the defender cohesive enough as a state to raise troops and supplies from the population it governs (coalitions, fragmentation, civil strife and recent war exhaustion lower this)?", ["fragmented, can raise almost nothing", "weak cohesion, raises only part", "average", "well united", "highly centralised and united"]],
}
QUESTIONS = {k: {"type": "score", "instructions": v[0], "criteria": v[1]} for k, v in Q.items()}
QUESTIONS["J9"] = {"type": "noul", "instructions": "There is some circumstance, not captured by the items above, that greatly changes the likelihood of war in this situation.",
                   "criteria": {"true": "a major circumstance outside the items above exists", "false": "the items above roughly capture the situation"}}


PAID_MODEL = "jev-1.13"     # Amendment 1: only after FreeUsageLimitError
BUDGET_USD = 0.50           # hard cap for paid answers in this validation
FREE_RETRY_AFTER = 900      # seconds before trying the free model again
state_ = {"paid_until": 0.0, "spent": 0.0}


def post(state, model=MODEL):
    body = json.dumps({"model": model, "state": state, "questions": QUESTIONS}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(ZEN, data=body, headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json",
                                                         "User-Agent": "icb-war-judgment/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


cases = [json.loads(l) for l in (HERE / "data" / os.environ.get("CASES", "cases.jsonl")).read_text(encoding="utf-8").splitlines() if l.strip()]
cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {"model": MODEL, "items": {}}
state_["spent"] = sum(float(v.get("cost") or 0) for v in cache["items"].values() if v.get("billing") == "balance")
done = 0
t0 = time.time()
for c in cases:
    for rep in range(REPS):
        ck = f"{c['id']}#{rep}"
        if ck in cache["items"]:
            continue
        for attempt in range(8):
            use_paid = time.time() < state_["paid_until"]
            if use_paid and state_["spent"] + 0.0002 > BUDGET_USD:
                CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
                raise SystemExit(f"budget cap reached: spent ${state_['spent']:.4f}; cache kept")
            try:
                d = post(c["state"], PAID_MODEL if use_paid else MODEL)
                break
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "replace")[:300]
                if "FreeUsageLimitError" in msg:
                    state_["paid_until"] = time.time() + FREE_RETRY_AFTER
                    print(f"  {ck} free limit -> paid {PAID_MODEL} for {FREE_RETRY_AFTER}s (spent ${state_['spent']:.4f})", flush=True)
                    continue
                wait = 30 * (attempt + 1) if e.code in (429, 402) or "limit" in msg.lower() else 5 * (attempt + 1)
                print(f"  {ck} HTTP {e.code} {msg[:120]} -> wait {wait}s", flush=True)
                time.sleep(wait)
            except Exception as e:
                print(f"  {ck} {str(e)[:120]} -> wait 10s", flush=True)
                time.sleep(10)
        else:
            raise SystemExit(f"Jev failed 8 times on {ck}; cache kept, rerun to resume")
        u = d.get("usage") or {}
        cost = float(u.get("cost") or 0)
        billing = u.get("opencode", {}).get("billing_source")
        if billing == "balance":
            state_["spent"] += cost
        cache["items"][ck] = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "model": d.get("model"), "answers": d["answers"],
                              "billing": billing, "cost": cost}
        done += 1
        if done % 25 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"{len(cache['items'])}/{len(cases) * REPS} answers, paid ${state_['spent']:.4f}, {time.time() - t0:.0f}s", flush=True)
        time.sleep(0.2)
CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
paid = sum(1 for v in cache["items"].values() if v.get("billing") == "balance")
print(f"done: {len(cache['items'])} answers, paid answers: {paid}, paid ${state_['spent']:.4f}, {time.time() - t0:.0f}s", flush=True)
