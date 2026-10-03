# Data card

Full list with links and licences: `docs/DATA_SOURCES.md`. This card summarises what each dataset used **by the app**
covers and **does not cover**.

| Dataset | Covers | Does not cover | Synthetic? |
| --- | --- | --- | --- |
| `data/rules.json` (26 rules) | Danger signs and referral triggers paraphrased from TZ STG 2021, WHO ANC 2016, WHO PNC 2022, WHO IMCI 2014, WHO pre-eclampsia fact sheet, WHO AFRO IDSR; outbreak syndromes and guidance | Treatment or dosing (deliberately), newborn-specific rules, HIV/TB management, mental health beyond referral, any condition not listed. **Pending clinician review** | No (sourced), but paraphrased |
| `data/questionnaires.json` | Intake for pregnant, postpartum, after stillbirth, child, mother herself; social/environment exposures | Validated screening scales (e.g. EPDS), newborn exam, physical examination | Wording draft |
| `data/icd10_draft.json` (27 codes) | Draft rule-out codes for the clinician view | Codes not linked to a rule; **not verified** in the WHO browser yet (`verified: false`) | — |
| `data/intent_seed.csv` (~200 phrases) | How a mother might describe 21 symptoms/exposures in Swahili/English | Real speech, dialects, Sheng, local languages, children's own words | **Yes** |
| `data/intent_labels.json` | Fixed output list of the model | Anything outside it | — |
| `data/sms_templates.json` | SMS and voice texts (≤ 160 chars, no symptoms) | Languages other than Swahili/English | Wording draft |
| `data/facilities_sample.json` | 5 facilities + 1 drug shop in fictional Ondera | Real facilities (use `scripts/fetch_facilities_osm.py`), opening hours, staff, stock | **Yes** |
| `data/slots_sample.json` | Referral slots for 4 demo days | Real clinic capacity | **Yes** |
| `data/outbreak_counts_synthetic.csv` | 8 weeks × 4 wards × 4 syndromes | Real surveillance data; reporting delays; under-reporting | **Yes** |
| `data/test_cases.json` | 19 golden encounters for the rules engine | Real patients | **Yes** |

Everything synthetic shows a **"Sample data"** badge in the UI. All Swahili text is a draft pending native-speaker
review (`review: "pending"` flags kept in the files).

## Known gaps and biases

- Evidence is mostly from northern Tanzania; other regions differ in disease mix (e.g. malaria transmission).
- Training phrases were written by the team: they reflect how *we* think mothers speak.
- Straight-line walking time ignores terrain, rivers and rainy-season roads (MAP travel-time rasters would be better).
