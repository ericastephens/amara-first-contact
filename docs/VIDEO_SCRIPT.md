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
