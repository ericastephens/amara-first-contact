# Build guide: Amara First Contact with Claude Code + GitHub

Step-by-step instructions to build the hackathon demo with Claude Code, following the World Bank
Challenge 04 requirements. Each phase has a copy-paste prompt for Claude Code and a "done when" check.

> Deadline: submissions close at the end of the competition weekend (3–4 Oct 2026). Check the exact time
> on the Hack-Nation site. The video (2–5 min) is mandatory: entries without it are not shortlisted.

---

## 0. Set up (20 min)

1. **Create the repo.** On GitHub: New repository → `amara-first-contact` → Public (judges need the link)
   → no template. Clone it locally.
2. **Copy this kit** into the repo root (keep `CLAUDE.md` at the root, Claude Code reads it every session).
   ```bash
   git add . && git commit -m "Starter kit: brief, data, build guide" && git push
   ```
3. **Install Claude Code** (pick one):
   - macOS / Linux / WSL: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`
   - Or use the Desktop app (Code tab), or run it in the browser at https://claude.ai/code with the GitHub repo connected.
   Then: `cd amara-first-contact && claude` (log in on first run).
4. **Optional, for the team:** inside Claude Code run `/install-github-app` (needs `gh auth login` and repo admin).
   Then anyone can write `@claude <task>` in an issue or PR comment and Claude opens a PR.
5. **Tools you need locally:** Node 20+, Python 3.10+ (`pip install scikit-learn pandas datasets`), Git.

**Team split suggestion:** one person drives Claude Code on the app (Phases 1–8), one prepares data and the
intent model (Phases 2 and 4), one writes the docs and records the video (Phase 11) from Phase 6 onwards.

**How to work with Claude Code each phase:**
- Start each phase in **Plan mode** (Shift+Tab until it says plan) and paste the prompt. Read the plan, then let it build.
- One branch per phase: ask Claude "create branch `phase-3-intake`, build, run tests, commit, open a PR".
- After each phase: `npm run test`, `npm run build`, open the app with DevTools → Network → **Offline** and click through.

---

## 1. Scaffold the offline app (45 min)

**Prompt:**
```
Read CLAUDE.md and BUILD_GUIDE.md. Scaffold Phase 1:
- Vite + React + TypeScript app in the repo root, vite-plugin-pwa configured so the app shell, all files in
  data/ (copy them to public/data at build time) and public/models/ are precached and the app works fully offline after first load.
- Mobile-first layout at 360px. Top bar: app name "Amara", language toggle SW/EN, a Network On/Off toggle
  (simulated, for the demo) and a sync status pill ("Offline · 2 queued" / "Synced 14:02").
- Three role views reachable from a start screen: Responder (intake), Clinician (clinic dashboard), District (surveillance).
- i18n with src/i18n/en.json and sw.json; all UI strings go there.
- IndexedDB storage module with typed stores: patients, encounters, referrals_outbox, sms_outbox, outbreak_counts.
- PIN lock screen (4 digits, demo PIN 1234) before any patient data is shown.
- Vitest set up with one passing test. GitHub Actions workflow that builds and deploys to GitHub Pages on push to main.
Then run the build and tests.
```
**Done when:** the deployed Pages link loads, you switch DevTools to Offline, reload, and the app still opens.

---

## 2. Data layer (30 min)

**Prompt:**
```
Phase 2. Load and validate everything in data/:
- Write TypeScript types and a zod schema for each file (questionnaires.json, rules.json,
  icd10_draft.json, sms_templates.json, facilities_sample.json, slots_sample.json, intent_labels.json).
- A loader that reads from the precached copies (works offline) and fails loudly in dev if a file is invalid.
- Any record with "synthetic": true or any file named *synthetic* must surface a "Sample data" badge where it is shown.
- Unit tests: every rule references symptom ids that exist in intent_labels.json or questionnaires.json; every
  rule has a non-empty source; every ICD-10 code in rules exists in icd10_draft.json.
```
**Done when:** `npm run test` passes, including the cross-reference tests. `python scripts/check_data.py` must also pass
after any edit to `data/` (it checks references, the 19 golden cases, SMS length and the outbreak flag).

Optional real data (not required for the demo, good for "data grounding"):
- `python scripts/fetch_facilities_osm.py` pulls real clinics, health centres and pharmacies for a Kilimanjaro
  coffee-growing area from OpenStreetMap into `data/facilities_osm_kilimanjaro.json`.
- See `docs/DATA_SOURCES.md` for the Maina et al. public facility list and the MAP travel-time rasters.

---

## 3. Intake questionnaire (1.5 h)

**Prompt:**
```
Phase 3. Build the Responder intake from data/questionnaires.json:
- Step 1: who is being seen: pregnant / postpartum / after stillbirth / child (ask child age) / mother herself (other).
- Step 2: common block (all): main complaint in her own words (free text box, Swahili or English), fever and
  days, medicines already taken (with "dawa za mseto / malaria tablets" as a quick choice).
- Step 3: the module for the group chosen (pregnancy, postpartum, stillbirth, child IMCI general danger signs).
- Step 4: social and environment block: farmer, animals at home, animals sick or aborting, raw milk, rats,
  flood/stream water, water source, distance/time to clinic, physical activity, who can read SMS for her,
  preferred language and channel (SMS / voice call).
- Optional blood pressure entry (only shown when the role setting says a cuff is available).
- Each question supports keypad-style answers (large buttons 1/2/3) and shows a speaker icon that will play
  data/audio/<question_id>_<lang>.mp3 if present (placeholder files are fine).
- Save the encounter to IndexedDB as answers + timestamps. Swahili and English labels from the JSON.
```
**Done when:** you can complete an intake for each of the four groups, offline, in Swahili.

---

## 4. The small AI: intent model (1.5 h, in parallel with Phase 3)

1. Generate training data and train:
   ```bash
   python scripts/train_intent.py            # uses data/intent_seed.csv only
   python scripts/train_intent.py --massive  # also pulls MASSIVE sw-KE as "other" examples (needs internet + `pip install datasets`)
   ```
   This writes `public/models/intent_model.json` and `docs/MODEL_REPORT.md` (accuracy, per-label scores, size).
2. **Biggest accuracy lever:** the seed file has only ~9 phrases per label, so held-out accuracy is low
   (see the report). Ask Swahili speakers on the team to add 30–50 natural phrases per label to
   `data/intent_seed.csv` (how a mother would really say it, including Sheng and code-mixing), then retrain.
   Keep the `lang` column and mark rows you collected from real people separately (with consent).
3. **Prompt:**
```
Phase 4. Port scripts/intent_reference.mjs (already tested against the Python export) to src/ai/intent.ts.
It loads public/models/intent_model.json and reproduces the Python pipeline exactly: lowercase, strip accents and punctuation, char n-grams (2–4, word-boundary padded as
sklearn char_wb), TF-IDF with the exported vocabulary and idf, L2 normalise, linear scores, softmax.
Return top labels with probabilities. Multi-label: split the input on sentence/comma boundaries and on
"na"/"and", classify each chunk, keep labels with p >= model.threshold (0.40); anything below is "uncertain".
- Write a parity test: tests/fixtures/intent_parity.json (written by the Python script) must match within 1e-6.
- In the intake, after the free-text box, show detected items as chips the responder can confirm or remove,
  plus a grey "Not sure" chip for uncertain chunks. Confirmed chips become symptom ids on the encounter.
```
**Done when:** the parity test passes and typing "nilimeza dawa za mseto lakini homa bado ipo, na kichwa kinauma"
shows chips for *fever not cleared by malaria treatment* and *headache*.

**Be honest in the video:** the seed phrases are synthetic (written by us, to be reviewed by Swahili speakers);
report held-out accuracy from `docs/MODEL_REPORT.md` and say it needs real, consented phrases from the field.

---

## 5. Rules engine, note and flags (2 h)

**Prompt:**
```
Phase 5. Implement src/logic/rules.ts that evaluates data/rules.json against an encounter, following the
"semantics" field in rules.json and behaving exactly like the reference engine in scripts/check_data.py
(group, gestational weeks, days since birth, child age, confirmed symptom ids, exposure answers, BP reading).
- Output: urgency (go_now > refer_today > refer_routine > home_care_followup), list of fired rules with their
  reason text in the current language and their source, conditions to rule out (from the rule's rule_out list,
  each with ICD-10 code and title from data/icd10_draft.json), and a list of unanswered questions that would
  change the result.
- If no rule fires and any chip is "uncertain", urgency = "ask_clinic" with reason "Not sure — ask the clinic".
- Structured note generator: SOAP-style plain text note (who, complaint in her words + translation, answers,
  exposures, BP, flags with sources, draft codes marked "Draft — clinician to confirm").
- Three views of the same result: Mother (none of this, only what to do), Responder (urgency + reasons + sources,
  confirm/override buttons with a required reason when overriding), Clinician (full note + rule-outs + draft codes).
- Unit tests in tests/rules.test.ts using every case in data/test_cases.json, each must produce the expected urgency
  and must never put rule_out or ICD-10 text in the Mother view.
```
**Done when:** all golden test cases pass.

---

## 6. Referral, slot, code and SMS (1.5 h)

**Prompt:**
```
Phase 6. Referral:
- Nearest suitable facility: from data/facilities_sample.json (or facilities_osm_*.json if present), filter by
  the level the rule requires (dispensary / health_centre / hospital), sort by straight-line distance from the
  responder's location (haversine) and show distance and an estimated walking time (5 km/h, labelled estimate).
- Slot: take the earliest free slot from data/slots_sample.json for that facility; go_now ignores slots and
  shows "Go now" with a printable paper referral; refer_today picks today; refer_routine picks the next 3 days.
  Slots are reserved locally and marked "provisional" until sync confirms.
- Referral code generated on device: 1 letter + 2 digits from an unambiguous alphabet (no O/0, I/1), unique on
  this device, e.g. K47. Store the referral in referrals_outbox.
- SMS: render data/sms_templates.json in the preferred language with clinic, day, time, code. Max 160 characters
  (test it). Never include a symptom or diagnosis. Show it in a phone mock-up. If channel = voice, show the
  voice script and a "play" button using the browser speech synthesis as a stand-in.
- Paper slip view (big code, clinic, day, time) for no-signal cases.
```
**Done when:** a refer_today case produces a provisional slot, a code, a ≤160-character SMS in Swahili and a paper slip.

---

## 7. Offline queue and sync (1 h)

**Prompt:**
```
Phase 7. Store-and-forward:
- src/sync/mockServer.ts simulates the clinic and district servers inside the browser (separate IndexedDB namespace).
- When Network = Off (toggle or navigator.onLine false): referrals and SMS stay in the outbox; the top pill shows
  "Offline · N queued". When Network = On: flush the outbox to the mock server, mark slots confirmed (or move to the
  next slot if taken), mark SMS "sent", update the pill to "Synced HH:MM".
- Retry with backoff; nothing is lost on reload.
- Clinic side shows each referral's status: Sent, Arrived (button), Not arrived after 48 h (simulated clock control
  for the demo) which queues an evening reminder SMS/voice call.
```
**Done when:** with Network Off you complete an intake, reload the page, turn Network On, and the referral appears on the Clinician view.

---

## 8. Clinic dashboard and outbreak escalation (1.5 h)

**Prompt:**
```
Phase 8. Clinician and District views:
- Clinician: today's referrals (urgency colour, code, reason, arrival status), open one to see the full note,
  rule-outs and draft ICD-10 codes; clinician can confirm/edit codes (confirmed codes lose the Draft label).
- Outbreak detection in src/logic/outbreak.ts using data/outbreak_counts_synthetic.csv plus counts generated by
  synced encounters: per ward and syndrome, flag when this week's count >= 3 AND > mean + 2*SD of the previous
  4 weeks (EARS-style). Unit-test it on the synthetic file (it must flag fever_rash in Ondera ward in week 40 and
  nothing else).
- When flagged: (1) a knowledge-sharing card appears for clinics within 25 km with the quoted guidance text from
  data/rules.json outbreak_guidance (source shown); (2) if the syndrome is on the immediately-notifiable list in
  data/rules.json, or the threshold is crossed, create an escalation DRAFT for the district surveillance officer
  in eIDSR-like fields (syndrome, ward, counts, dates, reporting facility). It stays Draft until a user with the
  Clinician or District role presses Approve; then it moves to "Sent (queued if offline)".
- Every dashboard row shows "last synced" per reporting site, so silence is not read as zero cases.
- District view: only anonymous counts, map-free table plus a small line chart per syndrome.
```
**Done when:** the synthetic data triggers exactly one flag, the knowledge card appears, and escalation needs Approve.

---

## 9. Optional: speech and translation on device (only if Phases 1–8 are done)

**Prompt:**
```
Phase 9 (optional). Add lazy-loaded Transformers.js features behind a "Download voice & translation pack" button:
- Speech-to-text: onnx-community/whisper-small (or whisper-base if too slow), language "swahili", task "transcribe".
- Translation: Xenova/nllb-200-distilled-600M, swh_Latn <-> eng_Latn, for the responder view and the note.
- Cache the models for offline use after first download; show download size and a progress bar.
- If loading fails or the device is slow, hide these buttons; the typed and keypad path must still work.
- Measure and record in docs/MODEL_REPORT.md: download size, load time and inference time on a mid-range phone,
  and word error rate on 20 FLEURS Swahili test sentences (scripts/eval_asr_fleurs.md explains how).
```
**Be honest:** these models are hundreds of MB; for the field they would be side-loaded by SD card at training,
not downloaded over 3G. NLLB and MMS weights are CC-BY-NC (fine for a non-commercial demo; flag for a pilot).

---

## 10. Tests and checks (45 min)

**Prompt:**
```
Phase 10. Hardening:
- Run all tests; add tests for: SMS length <= 160 and no symptom words in SMS/voice text (check against a
  banned-words list built from intent labels and icd10 titles); Mother view never shows rule_out or codes;
  escalation cannot be sent without Approve; go_now path works with Network Off and no slots.
- Lighthouse PWA check passes; app works after reload in Offline.
- Add a "Demo mode" button that loads 3 scripted patients (from data/test_cases.json ids demo_1..3) so the video is repeatable.
- Update docs/REQUIREMENTS_CHECKLIST.md with links to the code, tests and screenshots for each requirement.
```

---

## 11. Docs and video (2 h, start writing during Phase 6)

Create these in `docs/` (ask Claude to draft from the code, then edit by hand):
- `MODEL_CARD.md` — what the intent model does, training data (synthetic + MASSIVE), metrics, limits, threshold.
- `DATA_CARD.md` — from `DATA_SOURCES.md`: what each dataset covers and **does not cover** (this is scored).
- `RESPONSIBLE_AI.md` — guardrails, where data sits, who can read it, what happens if the phone is lost or shared,
  consent wording, bias risks (Swahili-only training, northern-Tanzania evidence, synthetic phrases).
- `VIDEO_SCRIPT.md` — use the structure below.

**Video (2–5 min), in the order the brief lists:**
1. **Problem statement (one sentence, brief's format):** "Because of this tool, a first responder near Noor will
   refer a mother or her child with danger signs to the right clinic with a booked slot and her history sent ahead,
   instead of selling medicine and sending her home; we know because [evidence from docs/DATA_SOURCES.md]."
2. **AI capabilities and why not a simpler tool:** the small model reads her own Swahili words (a form cannot);
   it says "not sure" instead of guessing; outbreak detection across clinics. Guardrails on screen.
3. **Demo:** phone in flight mode → intake → chips → flags with sources → slot + code → SMS → network on → clinic
   sees it → outbreak flag → Approve escalation.
4. **Where it sits in Noor's day:** on her way down from the slope, at the drug shop; evening voice call when her phone is with her.
5. **Tech stack:** PWA, IndexedDB, intent model size, optional Whisper/NLLB, mock sync.
6. **Your take:** what localizing AI means to you (Amara's story), and how it would fare in a less-supported
   language (keypad + recorded audio; needs local speech data).

---

## Submission checklist

- [ ] Prototype link (GitHub Pages) + repo link
- [ ] Video 2–5 min uploaded and linked
- [ ] Named local language: Swahili (and how a less-supported language is handled)
- [ ] Data sources cited, licences, what data does not cover, synthetic data labelled
- [ ] Guardrails visible in the demo (sources, "not sure", human approval, no diagnosis to the mother)
- [ ] `docs/REQUIREMENTS_CHECKLIST.md` complete
