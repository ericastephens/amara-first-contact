# Amara First Contact — project instructions for Claude Code

Read this file at the start of every session. It is the source of truth for scope, stack and safety rules.

## What we are building

An offline-first referral and triage companion for **mothers and their children** (pregnant, postpartum,
after a stillbirth, and mothers of children under 18) in rural Tanzania. It is our entry to the
World Bank × Hack-Nation **Small AI for Development Hackathon, Challenge 04, Health track** (3–4 Oct 2026).

The user in the brief is **Noor**: 38, farms coffee, maize and beans on 2 ha in the (fictional) Ondera
highlands; mother of a 16-year-old daughter who is home only at weekends with a smartphone. Noor has a
basic phone (calls, SMS, mobile money), no Wi-Fi, buys 3G bundles occasionally, speaks her local language
and uses Swahili when she must. Her clinic is overcrowded; doctors are not always up to date; heavy
record-keeping leaves little time per patient.

The **first responder** (drug shop dispenser, community health worker, or dispensary nurse) uses our app.
Noor receives **SMS or voice** only.

## The demo journey (must work end to end, in flight mode)

1. Responder opens the app (installed PWA, offline). Picks who is being seen: pregnant / postpartum /
   after stillbirth / child.
2. Noor answers in Swahili, by typing, keypad choices, or (optional) speech. The app shows a translation
   for the responder if needed.
3. The **small intent model** turns her free-text words into a fixed list of symptoms and exposures.
   Low confidence → "Sijui / Not sure — ask the clinic".
4. The **rules engine** (NOT the model) applies `data/rules.json` → urgency, reasons with sources,
   conditions to rule out with **draft** ICD-10 codes (clinician-only view).
5. A structured note is written. Nearest suitable facility chosen from `data/facilities_*.json`,
   a time slot taken from `data/slots_sample.json`, referral code created **on the device**.
6. Noor's SMS preview appears in her preferred language (`data/sms_templates.json`). If offline,
   the referral is queued (store-and-forward) and a paper-slip view is offered.
7. Turning the network back on syncs the queue. The clinic dashboard shows the referral,
   and an outbreak panel that flags a rising cluster in `data/outbreak_counts_synthetic.csv`,
   sends a knowledge-sharing flag to nearby clinics, and drafts an escalation to the district
   surveillance officer that a human must approve.

## Stack (keep it simple)

- **Vite + React + TypeScript**, Progressive Web App via `vite-plugin-pwa` (service worker precaches
  the app shell and all `data/*.json` and `public/models/intent_model.json`).
- **IndexedDB** (via `idb-keyval` or `dexie`) for patients, notes, referral queue, outbox SMS.
- **No backend for the demo.** "Sync" is simulated: an in-browser mock server module + `navigator.onLine`
  and a manual "Network on/off" toggle for the video.
- **Intent model:** char n-gram TF-IDF + logistic regression trained in Python
  (`scripts/train_intent.py`), exported to JSON, run in TypeScript (`src/ai/intent.ts`). Target < 1 MB.
- **Optional heavy AI (Phase 9 only, lazy-loaded, never required):** Transformers.js —
  Whisper (`onnx-community/whisper-small` or base) for Swahili speech-to-text, NLLB-200 distilled
  (`Xenova/nllb-200-distilled-600M`, `swh_Latn` ↔ `eng_Latn`) for translation. If they fail or are slow,
  the keypad + typed path must still complete the journey.
- Tests: **Vitest**. Deploy: **GitHub Pages** via GitHub Actions.

## Hard safety rules (the brief's Responsible AI test is pass/fail)

1. **Never generate medical advice.** Every flag, reason and next step shown to a user must come from
   `data/rules.json`, and must display its `source` field.
2. **No diagnosis to the mother or the responder.** Mother sees: where to go, when, her code.
   Responder sees: urgency + reason for referral. Only the **Clinician** view shows "conditions to rule out"
   and draft ICD-10 codes, each labelled "Draft — clinician to confirm".
3. **"Not sure" is a valid output.** If intent confidence < threshold (set in the model file, currently 0.40) or no rule matches,
   show "Not sure — ask the clinic" and offer the "Ask the clinic" path. Never guess.
4. **A person decides.** Responder confirms/overrides every flag before a referral is sent.
   Outbreak escalation is a **draft** until a clinician or surveillance officer presses Approve.
5. **Urgent never waits for tech.** If any rule returns `go_now`, show "Go now" with a paper referral
   immediately, regardless of sync or slot availability.
6. **Privacy.** Data stays on device (IndexedDB) until synced. PIN lock on the app. SMS and voice texts
   never contain a diagnosis or symptom; only clinic, day/time, code. District sees only anonymous counts.
7. **Label synthetic data.** Anything in `data/*synthetic*` or `"synthetic": true` must show a
   "Sample data" badge in the UI.
8. **Cite data.** Every dataset used is listed in `docs/DATA_SOURCES.md` with licence and what it does not cover.

## Languages

- Swahili (`sw`) and English (`en`) in the UI. All strings in `src/i18n/{sw,en}.json`.
- Swahili text in `data/` is a **draft for native-speaker review**; keep the `review: "pending"` flags.
- Less-supported local languages (e.g. Chagga, Maa): handled by keypad answers + pre-recorded audio
  prompts (placeholder audio files), not by speech models. Say this in the UI copy and the video.

## Coding conventions

- Small, pure functions for logic (`src/logic/*`), fully unit-tested. UI in `src/ui/*`.
- No network calls in the core path. `grep -r "fetch(" src/` should only show the mock sync module and the
  optional Phase 9 model loader.
- Mobile-first layout (360 px wide), large tap targets, works on a low-end Android Chrome.
- Commit per phase on its own branch; open a PR; keep `docs/REQUIREMENTS_CHECKLIST.md` updated.

## Where things are

- `BUILD_GUIDE.md` — phases and prompts.
- `docs/REQUIREMENTS_CHECKLIST.md` — the World Bank requirements and how we meet each.
- `docs/DATA_SOURCES.md` — every dataset with link, licence, use, gaps.
- `data/` — seed data (rules, ICD-10 draft list, questionnaires, SMS templates, synthetic facilities/slots/outbreak counts, intent seed phrases).
- `scripts/` — data checks, model training, the reference intent implementation, OSM facility fetch.
  - `python scripts/check_data.py` is the **reference rules engine**: the TypeScript engine must give the same results on `data/test_cases.json`.
  - `node scripts/intent_reference.mjs` is the **reference intent model** in JS: port it to `src/ai/intent.ts` unchanged in behaviour.
