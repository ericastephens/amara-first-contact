# Video script (2–5 min)

Setup: phone (or Chrome DevTools at 360 px). Settings → Reset demo data. Language SW. Network toggle 📶 on.

1. **Problem (0:00–0:25).** "Because of this tool, a first responder near Noor will refer a mother or her child with
   danger signs to the right clinic with a booked slot and her history sent ahead, by the same day, instead of selling
   medicine and sending her home; we know because in northern Tanzania 60.7% of severe fevers were diagnosed as malaria
   but only 1.6% were malaria (Crump et al.), and 31% of people go first to a drug shop (PLOS ONE)."
2. **AI and why not a simpler tool (0:25–0:55).** The small model (660 KB, on the phone) reads her own Swahili words —
   a form cannot. It says "Not sure" instead of guessing. Rules with sources decide; a person confirms. Outbreak
   detection across clinics. Guardrails on screen: sources, "Not sure", Approve, no diagnosis to the mother.
3. **Demo (0:55–3:30).**
   - Tap ✈️ (network off). PIN 1234 → Responder → "Mama mwenyewe" → name Noor.
   - Type: *nilimeza dawa za mseto lakini homa bado ipo, na kichwa kinauma* → chips appear → confirm.
   - Keypad: fever yes, mseto yes, fever still there yes. BP never checked: no. Rats/flood water: yes. Consent: yes.
   - Result: "Refer today", three reasons with sources → confirm each (show Override needs a reason).
   - Tabs: Mother (no diagnosis) vs Clinician (rule-outs, Draft codes, note).
   - Create referral: Mlima Health Centre, provisional slot, code, Swahili SMS (≤160), paper slip. Pill: "Offline · 3 queued".
   - Tap 📶 → "Synced". Clinician: referral arrived; slot moved by clinic (SMS "slot moved"). Open note; confirm a code.
   - +48 h → "Not arrived · reminder queued" (evening voice/SMS).
   - Outbreak watch: fever with rash, Ondera, week 40 → guidance card to clinics within 25 km → escalation Draft → Approve.
   - District: anonymous counts + chart. Demo mode → Amina (32 weeks, headache + blurred vision) → red GO NOW banner.
4. **Noor's day (3:30–3:50).** On her way down from the slope, at the drug shop; evening voice call when the phone is with her.
5. **Tech stack (3:50–4:10).** Vite + React PWA, IndexedDB, 660 KB intent model in TypeScript, rules engine, mock sync, 70 tests.
6. **Our take (4:10–4:45).** What localizing AI means to us (Amara's story). Less-supported languages: keypad + recorded
   audio now; local speech data needed before speech models can help.

Say honestly: seed phrases are synthetic; held-out accuracy 0.58 (see MODEL_REPORT); rules pending clinician review.

## Recorded walkthrough (captioned, 3:50)

`scripts/record_demo.py` records the whole journey in flight mode on a 390 px phone layout, with on-screen captions,
against a local build (`npm run build && npx vite preview --port 4173`). Encode for upload:

```
ffmpeg -i recordings/raw/*.webm -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart amara_demo_vertical.mp4
```

The captions carry the story, so the video works silent. To meet the brief's "your take" and problem-statement
parts, record a voice-over on top (phone voice memo is fine) using the lines below. Times are approximate.

| Time | On screen | Voice-over (say it in your own words) |
| --- | --- | --- |
| 0:00 | Title | "We are Amara Health. This is Amara First Contact." |
| 0:07 | Landing | "Noor farms coffee on the Kilimanjaro slopes. When she or her daughter is ill, her first stop is the drug shop: 31% of people in Tanzania go there first. In northern Tanzania 60.7% of severe fevers were called malaria, but only 1.6% were." |
| 0:21 | PIN, setup strip | "The dispenser sets up once: district, role, languages and a work ID. The clinics are real, from OpenStreetMap, saved for offline use." |
| 0:42 | Flight mode | "From here on there is no internet." |
| 0:49 | Noor's words typed | "Noor explains in her own Swahili words." |
| 1:00 | What the small AI heard | "This is the AI. A model under 1 MB runs on the phone. It sorts each phrase into a fixed list of symptoms and exposures and shows how sure it is. A form can't read her words; this can." |
| 1:10 | Not sure | "'Nimechoka', I'm tired, is too vague. Below 40% the model says Not sure and asks the dispenser to check. It never guesses." |
| 1:17 | Confirm chips, keypad | "The dispenser confirms what was heard, then keypad questions cover farm work, animals, water, distance and her phone." |
| 1:31 | Result | "The rules engine, not the AI, decides urgency, and each reason shows its guideline source. A person confirms every flag." |
| 1:52 | Mother and Clinician tabs | "Noor never sees a diagnosis. Only the clinician sees conditions to rule out, as draft ICD-10 codes." |
| 2:06 | Referral and SMS | "The nearest suitable real clinic, a slot and a code are made on the phone. Her SMS is in Swahili, under 160 characters, and says nothing about her health. Kichaga speakers get a recorded voice call." |
| 2:34 | Amina | "Amina is 32 weeks pregnant with a severe headache and blurred vision. Danger signs mean Go now with a paper referral. Urgent never waits for signal." |
| 3:09 | Network back | "When the network returns, the queue syncs." |
| 3:16 | Clinic dashboard and outbreak watch | "The clinic sees the referral before she arrives. Across clinics, a cluster of fever with rash triggers a guidance card for nearby clinics, and an escalation to the district that stays a draft until a person approves it with their work ID." |
| 3:44 | End card | "Small AI, rules with sources, a person decides. Our honest limits: the training phrases are synthetic, the outbreak data is a sample, and Swahili, rules and ICD codes are waiting for expert review. Next: a pilot with ten drug shops in Hai." |
