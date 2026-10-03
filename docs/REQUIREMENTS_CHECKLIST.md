# World Bank Challenge 04 requirements: how we meet each

Source: *Small AI for Development Hackathon, Concept Note* (World Bank × Hack-Nation, 2026), sections 05–09 and Annex A (Health).
Fill the "Evidence" column with links to code, tests, screenshots or video timestamps as you build.

## Section 05 — What you will build

| Requirement | How we meet it | Evidence |
| --- | --- | --- |
| A working prototype (app, chatbot, SMS service, voice line...) | Offline PWA for first responders + SMS/voice to the mother (simulated) + clinic and district dashboards | Pages link, repo |
| A clear answer to what the AI does and why a simpler tool (SMS, spreadsheet, search) would not do the same | Small model reads the mother's own Swahili words into a fixed symptom list and says "not sure" when unsure; outbreak detection across clinics. A form cannot read free speech; SMS alone cannot triage | `docs/MODEL_CARD.md`, video 0:40 |
| Proof it works on at least one sector | Health: end-to-end journey for 4 groups (pregnant, postpartum, after stillbirth, child) | `tests/rules.test.ts`, video |

## Section 06 — The rules

| Rule | How we meet it | Evidence |
| --- | --- | --- |
| Runs on a device the user already has | Responder: low-end Android phone browser (PWA). Mother: any basic phone (SMS / voice) | Video on a real phone |
| Core feature works offline | Intake, model, rules, note, code, slot (provisional), SMS draft all on device; store-and-forward sync | Flight-mode demo, `src/sync/` |
| Model files small enough to side-load or send over a weak connection | Intent model JSON < 1 MB (measured in `docs/MODEL_REPORT.md`); optional speech/translation pack is separate and side-loaded | `docs/MODEL_REPORT.md` |
| At least one interaction in a local language, named | **Swahili** (text and keypad; optional speech). Draft text reviewed by Swahili speakers | `src/i18n/sw.json`, `data/*.json` |
| Expect to be asked how it fares in a less-supported language | Keypad answers + pre-recorded audio prompts work in any language; speech/translation models do not cover e.g. Chagga or Maa; community recordings needed | Video "your take" |
| Guardrail: a person makes the final call; the tool flags what it is unsure of; checks in on agentic steps | Responder confirms/overrides every flag; clinician confirms codes; escalation needs Approve; "Not sure — ask the clinic" | `tests/guardrails.test.ts` |
| Guardrail: avoid hallucinations | No generated advice: all text from `data/rules.json` with sources; model only classifies into a fixed list | `CLAUDE.md` rule 1 |

## Section 07 — The data

| Requirement | How we meet it | Evidence |
| --- | --- | --- |
| Cite every data source | `docs/DATA_SOURCES.md` | — |
| Data that shows the problem (source, year, country) | Fever misdiagnosis, hypertension cascade, drug-shop use, literacy/phones (Tanzania) | `docs/DATA_SOURCES.md` part A |
| Data you build with: name, source, licence, size | MASSIVE sw-KE (CC-BY-4.0), synthetic seed phrases, OSM facilities (ODbL), ICD-10 list, STG/WHO rules | `docs/DATA_SOURCES.md` part B |
| **Indicate what your data does not cover (scored)** | "Does not cover" column for every dataset | `docs/DATA_CARD.md` |
| Label synthetic data | Files named `*synthetic*`, `"synthetic": true`, "Sample data" badge in UI | UI screenshot |

## Section 08 — Deliverables

| Deliverable | Status |
| --- | --- |
| Prototype: working tool with code or link | [x] code in this repo; Pages link after merge to `main` |
| Video 2–5 min (without it: not shortlisted) | [ ] |
| — Problem statement in the format "Because of this tool, [user] will [action] by [when] that they would otherwise [not do / do late / do worse]; we know because [evidence]" | [ ] |
| — AI capabilities, why a simpler tool would not do, guardrails | [ ] |
| — Tool demo, user journey end to end (+ tech stack) | [ ] |
| — Where the tool sits in the user's day | [ ] |
| — Your take: what localizing AI development means to you | [ ] |

## Section 09 — Judging criteria

| Criterion | Weight | Our strongest evidence |
| --- | --- | --- |
| Built solution (Small AI fidelity): works end to end within the constraints | 25% | Flight-mode journey; model < 1 MB; tests |
| Development relevance and impact | 20% | Noor's overcrowded clinic; drug shop as first stop; mothers and children |
| Data grounding | 15% | Brief's datasets used (DHS, GSMA, MASSIVE, OSM/healthsites, Maina, MAP, DHIS2, SDI) + gaps stated |
| Evidence it works | 15% | Golden test cases, model report, parity tests, Afya-Tek / ePOCT+ precedents |
| Clarity, design, inclusivity; value proposition of AI | 15% | Swahili + keypad + voice; "why not SMS" answer |
| Scalability, replicability, what happens next | 10% | Role and country settings; builds on Afya-Tek and eIDSR/DHIS2 |
| Responsible AI, data and safety | Pass/fail | `docs/RESPONSIBLE_AI.md`; no diagnosis to mother; human approval; privacy; lost-phone plan |

## Annex A — Health: points to address explicitly

- [ ] Improves one meaningful part of Noor's access to primary care or a frontline worker's ability to serve her (screening support, documentation, referral, follow-up, continuity of care). → **Referral + documentation + follow-up.**
- [ ] No medical imaging or diagnosis datasets ("interpreting them is out of bounds"). → We use none; draft codes are for clinician confirmation only.
- [ ] State where the data sits, who can read it, and what happens when the phone is lost or shared. → `docs/RESPONSIBLE_AI.md`.
- [ ] Preconditions: connectivity, clinician trust, regulatory acceptance. → Offline-first; clinician confirms; dispensers refer, never diagnose.

## Where each build phase lives (code and tests)

| Phase | Code | Tests |
| --- | --- | --- |
| 1 Offline PWA, roles, i18n, PIN, IndexedDB | `vite.config.ts`, `src/ui/App.tsx`, `src/ui/PinLock.tsx`, `src/i18n/`, `src/storage/db.ts`, `.github/workflows/deploy.yml` | build + offline e2e run |
| 2 Data layer | `src/data/schemas.ts`, `src/data/index.ts` | `tests/data.test.ts`, `scripts/check_data.py` |
| 3 Intake | `src/ui/responder/Intake.tsx`, `QuestionField.tsx`, `src/logic/encounter.ts` | — |
| 4 Intent model | `src/ai/intent.ts`, `src/ui/responder/Complaint.tsx` | `tests/intent.test.ts` (parity < 1e-6) |
| 5 Rules, note, three views | `src/logic/rules.ts`, `note.ts`, `views.ts`, `src/ui/responder/Result.tsx` | `tests/rules.test.ts` (19/19 golden cases) |
| 6 Referral, slot, code, SMS | `src/logic/referral.ts`, `sms.ts`, `src/services/referrals.ts`, `src/ui/responder/ReferralView.tsx` | `tests/referral.test.ts` |
| 7 Store-and-forward sync | `src/sync/sync.ts`, `mockServer.ts`, `network.ts`, `clock.ts` | `tests/sync.test.ts` |
| 8 Clinic dashboard, outbreak, escalation | `src/logic/outbreak.ts`, `src/ui/clinician/Clinician.tsx`, `src/ui/OutbreakPanel.tsx`, `src/ui/district/District.tsx` | `tests/outbreak.test.ts` |
| 9 Speech/translation (optional) | Not built. Typed + keypad path covers the journey | — |
| 10 Hardening, demo mode | Demo mode in `src/ui/App.tsx` | `tests/guardrails.test.ts` |
| 11 Docs | `docs/MODEL_CARD.md`, `DATA_CARD.md`, `RESPONSIBLE_AI.md`, `VIDEO_SCRIPT.md` | — |
