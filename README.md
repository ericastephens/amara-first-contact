# Amara First Contact

Offline-first referral and triage companion for mothers and their children in rural Tanzania.
Entry to the World Bank × Hack-Nation **Small AI for Development Hackathon, Challenge 04 (Health)**, 3–4 October 2026.

A first responder (drug shop dispenser, community health worker or dispensary nurse) uses the app on a low-end Android
phone, with or without signal. The mother answers in Swahili by typing, keypad or voice; a small on-device model turns
her words into a fixed list of symptoms and exposures; sourced guideline rules decide the urgency; the app books the
nearest suitable clinic, writes the note for the clinician, and sends the mother a short SMS or voice call with her code.
Clinics share flags when cases rise, and escalation to the district surveillance officer needs a human to approve.

## Start here

| File | What it is |
| --- | --- |
| [`BUILD_GUIDE.md`](BUILD_GUIDE.md) | Step-by-step build with Claude Code: setup, 11 phases with copy-paste prompts, video plan |
| [`CLAUDE.md`](CLAUDE.md) | Instructions Claude Code reads every session: scope, stack, safety rules |
| [`docs/REQUIREMENTS_CHECKLIST.md`](docs/REQUIREMENTS_CHECKLIST.md) | Every World Bank requirement and how we meet it |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Every dataset: link, licence, use, what it does not cover |
| `data/` | Seed data: questions, rules with sources, draft ICD-10 list, SMS templates, intent phrases, synthetic facilities, slots and outbreak counts, golden test cases |
| `scripts/` | `check_data.py` (reference rules engine + checks), `train_intent.py` (small model), `intent_reference.mjs` (JS inference + parity test), `fetch_facilities_osm.py` (real facilities) |
| `public/models/intent_model.json` | Trained intent model (~660 KB) |

## Quick checks

```bash
pip install scikit-learn pandas
python scripts/check_data.py        # 19/19 golden cases, SMS length, one outbreak flag
python scripts/train_intent.py      # retrain the small model, writes docs/MODEL_REPORT.md
node scripts/intent_reference.mjs   # parity with Python + demo detection
```

## Safety in one line

The model only sorts words into a fixed list; every flag comes from a cited rule; the mother never sees a diagnosis;
"not sure" is allowed; a person confirms every referral and approves every escalation.

## Status of the data

All patient data is synthetic. Ondera is the fictional place from the brief. Swahili text is a draft pending
native-speaker review; clinical rules are pending clinician review; ICD-10 codes are drafts to verify in the WHO browser.
