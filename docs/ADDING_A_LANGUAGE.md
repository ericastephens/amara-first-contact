# Adding a language (example: Twi for Ghana)

No code change is needed. A language is two files, picked up automatically at the next build and precached
for offline use.

```bash
node scripts/new_language.mjs tw "Twi"     # creates src/i18n/tw.json and data/sms/tw.json (empty strings)
node scripts/new_language.mjs --status     # translation coverage of every language
npm test                                    # checks every message is <= 160 characters, files are valid
```

| File | What to translate | Used for |
| --- | --- | --- |
| `src/i18n/<code>.json` | Every app interface string. Keep `{placeholders}` unchanged. Set `_native` to the language's own name | The responder's screens (the language button and setup offer it once any string is translated) |
| `data/sms/<code>.json` | SMS templates, voice scripts, the 7 day names (Monday first), `time_format` (`12h`, `24h` or `swahili`), digits 2–9 for reading the code aloud | Messages to the mother |
| `data/rules.json`, `data/questionnaires.json`, `data/intent_labels.json` (optional) | Add a `"<code>": "..."` field next to `"en"`/`"sw"` | Reasons, questions and symptom names (otherwise shown in English) |

## What happens before a language is fully translated

- **Empty string = not translated yet.** That one string or message falls back to the country's staff language,
  then English. A Twi patient in Ghana gets English SMS until the Twi templates are filled; never Swahili.
- **Support level updates itself** in setup: *Keypad and recorded audio only* → *Translation pending* (some strings
  or messages translated) → *Ready* (≥ 95% of interface strings and the referral SMS translated).
- Once the interface has any translation, the language appears as a staff language in setup and in the
  language button, even if `data/locales.json` lists it only as a patient language.
- The intent model reads Swahili and English only. Free text in other languages returns "Not sure", so use the
  keypad questions; recorded audio prompts go in `public/audio/<question_id>_<code>.mp3`.

## Safety rules for translators (same as the rest of the app)

- SMS and voice texts contain only name, clinic, day, time and code. **Never a symptom, diagnosis or test.**
- Every filled SMS must stay within 160 characters (`npm test` checks this for every language).
- Keep `review: "pending"` until a native speaker and, for clinical text, a clinician have checked it.

# Regions and districts

Outside Tanzania, setup offers region and district as **select-only** lists from `data/admin_areas.json`
(19 countries, built from geoBoundaries, licence per country recorded in the file). Rebuild or add a country:

```bash
python scripts/build_admin_areas.py          # all countries in data/locales.json except Tanzania
python scripts/build_admin_areas.py GH       # one country
```

A new country needs its ISO-3 code in `ISO3` in that script. Tanzania keeps the curated region list in
`data/locales.json` (geoBoundaries' Tanzania layer predates Songwe region and uses other Zanzibar names).
