# Responsible AI, data and safety

The brief's Responsible AI test is pass/fail. Each guardrail below is enforced in code and tested.

| Guardrail | How | Test |
| --- | --- | --- |
| No generated medical advice | Every reason/next step comes from `data/rules.json` and shows its `source`. The model only classifies into a fixed list | `tests/rules.test.ts` (every fired rule has a source) |
| No diagnosis to the mother | Mother view: urgency label, clinic, day/time, code only. SMS/voice: name, clinic, day, time, code | `tests/guardrails.test.ts` (banned-word check on every SMS/voice text; Mother view never contains codes/reasons) |
| No diagnosis to the responder | Responder sees urgency + reasons + source title. Guideline sections (which can name diseases), rule-outs and ICD-10 codes are **clinician-only**, labelled "Draft — clinician to confirm" | `tests/guardrails.test.ts` |
| "Not sure" is valid | Intent confidence < 0.40 → grey "Not sure" chip; nothing fires + open "not sure" → "Not sure — ask the clinic" | `tests/rules.test.ts` case `uncertain_only` |
| A person decides | Responder confirms or overrides **every** flag (override needs a reason) before "Create referral" is enabled. Clinician confirms/edits draft codes. Outbreak escalation is a **draft** until a Clinician or District user presses Approve; drafts never leave the device | `tests/outbreak.test.ts`, `tests/guardrails.test.ts` |
| Urgent never waits for tech | `go_now` shows a red "GO NOW" banner with the nearest hospital immediately; no slot needed; paper slip works offline | `tests/guardrails.test.ts` (go_now offline, no slots) |
| Label synthetic data | "Sample data" badge on facilities, slots, outbreak data | UI |

## Where the data sits and who can read it

| Data | Where | Who |
| --- | --- | --- |
| Encounter answers, her words, name, phone | Responder's phone (IndexedDB), behind the PIN | Responder |
| Referral + note | Phone outbox → clinic (after sync, with her consent) | Responder, receiving clinician |
| SMS / voice | Her phone | Her (or the person who reads for her) |
| Case counts | Phone → district | District sees **anonymous counts only** (ward, syndrome, week, count) |

## If the phone is lost or shared

- PIN lock before any patient data is shown; manual lock button in the top bar.
- **Demo limitation:** the PIN is a fixed demo value and IndexedDB is not encrypted. For a pilot: derive a key from the
  PIN (PBKDF2/WebCrypto) and encrypt records at rest; auto-lock after inactivity; remote wipe of unsynced data;
  purge synced records after N days.
- Shared phones: the app shows no patient list on the start screen; each encounter is opened only from the intake flow.

## Consent

Asked in every intake (`q_consent`, required): *"May we send your referral to the clinic and send you SMS or calls
about it?"* Without consent, no SMS is queued and the responder gives a paper slip only.

## Bias and risk

- Swahili-only training phrases, synthetic, written by the team; northern-Tanzania evidence base.
- Less-supported languages (Chagga, Maa) get keypad answers + recorded audio prompts, not speech models.
- Rules are paraphrased and **pending clinician review**; ICD-10 codes are **unverified drafts**.
- Over-referral is preferred to under-referral: missing numbers (weeks, days, age) count as meeting a rule's condition.
