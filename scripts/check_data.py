"""Validate the seed data and run a reference rules engine against data/test_cases.json.

Usage: python scripts/check_data.py
The TypeScript engine (Phase 5) must give the same results; this script is the spec in code.
"""
import csv
import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
load = lambda name: json.loads((D / name).read_text(encoding="utf-8"))

rules_doc = load("rules.json")
labels = {l["id"] for l in load("intent_labels.json")["labels"]}
icd = {c["code"] for c in load("icd10_draft.json")["codes"]}
q = load("questionnaires.json")
cases = load("test_cases.json")["cases"]
sms = load("sms_templates.json")
order = rules_doc["urgency_order"]
errors = []

# ---- cross-reference checks -------------------------------------------------
question_ids = {qq["id"] for m in q["modules"] for qq in m["questions"]}
for m in q["modules"]:
    for qq in m["questions"]:
        if "maps_to" in qq and qq["maps_to"] not in labels:
            errors.append(f"question {qq['id']} maps_to unknown label {qq['maps_to']}")
for r in rules_doc["rules"]:
    w = r["when"]
    for sid in w.get("any", []) + w.get("all", []):
        if sid not in labels:
            errors.append(f"rule {r['id']} uses unknown symptom {sid}")
    for qid in w.get("answers", {}):
        if qid not in question_ids:
            errors.append(f"rule {r['id']} uses unknown question {qid}")
    for code in r["rule_out"]:
        if code not in icd:
            errors.append(f"rule {r['id']} uses code {code} missing from icd10_draft.json")
    if r["source"] not in rules_doc["sources"]:
        errors.append(f"rule {r['id']} has unknown source {r['source']}")
    if r["urgency"] not in order:
        errors.append(f"rule {r['id']} has unknown urgency {r['urgency']}")
    for lang in ("en", "sw"):
        if not r["reason"].get(lang):
            errors.append(f"rule {r['id']} missing reason.{lang}")

# ---- reference rules engine -------------------------------------------------
def fires(rule, enc):
    w = rule["when"]
    syms = set(enc.get("symptoms", []))
    if enc["group"] not in rule["groups"]:
        return False
    if not set(w.get("all", [])) <= syms:
        return False
    if w.get("any") and not (set(w["any"]) & syms):
        return False
    for k, v in w.get("answers", {}).items():
        if enc.get("answers", {}).get(k) != v:
            return False
    if "min_gest_weeks" in w and enc.get("gest_weeks") is not None and enc["gest_weeks"] < w["min_gest_weeks"]:
        return False
    if "days_postpartum_max" in w and enc.get("days_postpartum") is not None and enc["days_postpartum"] > w["days_postpartum_max"]:
        return False
    if "child_age_months_lt" in w and enc.get("child_age_months") is not None and enc["child_age_months"] >= w["child_age_months_lt"]:
        return False
    if "bp" in w:
        bp = enc.get("bp")
        if not bp:
            return False
        if not (bp["sys"] >= w["bp"]["sys_gte"] or bp["dia"] >= w["bp"]["dia_gte"]):
            return False
    return True

def evaluate(enc):
    fired = [r for r in rules_doc["rules"] if fires(r, enc)]
    if fired:
        urgency = min((r["urgency"] for r in fired), key=order.index)
    elif enc.get("uncertain"):
        urgency = "ask_clinic"
    else:
        urgency = "home_care_followup"
    rule_out = []
    for r in fired:
        for c in r["rule_out"]:
            if c not in rule_out:
                rule_out.append(c)
    return urgency, [r["id"] for r in fired], rule_out

passed = 0
for c in cases:
    urg, fired, ro = evaluate(c["encounter"])
    exp = c["expected"]
    problems = []
    if urg != exp["urgency"]:
        problems.append(f"urgency {urg} != {exp['urgency']}")
    missing = set(exp["must_fire"]) - set(fired)
    if missing:
        problems.append(f"did not fire {sorted(missing)}")
    miss_codes = set(exp["rule_out_includes"]) - set(ro)
    if miss_codes:
        problems.append(f"missing codes {sorted(miss_codes)}")
    if problems:
        errors.append(f"case {c['id']}: " + "; ".join(problems) + f" (fired {fired})")
    else:
        passed += 1
print(f"rules engine: {passed}/{len(cases)} golden cases pass")

# ---- SMS length (worst case fill) ------------------------------------------
fill = {"name": "Mwanaidi", "clinic": "Hospitali ya Wilaya ya Ondera", "day": "Jumatano", "time_sw": "saa 8 mchana",
        "time_en": "2:00 pm", "code": "K47", "syndrome_sw": "homa na vipele", "syndrome_en": "fever with rash", "ward": "Ondera"}
for key, t in sms["templates"].items():
    for lang, text in t.items():
        out = text.format(**fill)
        if len(out) > 160:
            errors.append(f"SMS {key}.{lang} is {len(out)} chars > 160: {out}")
print("sms: all templates checked at worst-case length")

# ---- outbreak flag check ----------------------------------------------------
ob = rules_doc["outbreak"]
rows = list(csv.DictReader((D / "outbreak_counts_synthetic.csv").open()))
latest = max(int(r["iso_week"]) for r in rows)
flags = []
for ward in sorted({r["ward"] for r in rows}):
    for syn in sorted({r["syndrome"] for r in rows}):
        series = sorted((int(r["iso_week"]), int(r["count"])) for r in rows if r["ward"] == ward and r["syndrome"] == syn)
        counts = [c for _, c in series]
        cur, base = counts[-1], counts[-1 - ob["baseline_weeks"]:-1]
        mean, sd = statistics.mean(base), statistics.pstdev(base)
        if cur >= ob["min_count"] and cur > mean + ob["sd_multiplier"] * sd:
            flags.append((ward, syn, latest, cur))
print(f"outbreak: flags in week {latest}: {flags}")
if flags != [("Ondera", "fever_rash", 40, 7)]:
    errors.append(f"expected exactly one outbreak flag (Ondera, fever_rash, week 40), got {flags}")

if errors:
    print("\nERRORS:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("\nAll data checks passed.")
