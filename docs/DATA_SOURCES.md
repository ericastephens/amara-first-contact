# Data sources

The brief asks us to cite every source, name each dataset's source, licence and size, and say **what the data does
not cover** (this is scored). "In brief" marks datasets the World Bank concept note lists. Check licences yourself
before building; access terms change.

## A. Data that shows the problem (cite with year and country)

| Evidence | Number | Source | Does not cover |
| --- | --- | --- | --- |
| Severe fevers diagnosed as malaria vs actually malaria | 60.7% vs 1.6%; 26.2% were bacterial zoonoses, none considered by clinicians | [Crump et al., PLOS NTDs, northern Tanzania](https://journals.plos.org/plosntds/article?id=10.1371%2Fjournal.pntd.0002324) | Hospital admissions 2007–08, not outpatients or drug shops |
| Brucellosis delay | Median 90 days to hospital; 44.8% missed on first visit | [BMC Public Health, rural Tanzania](https://link.springer.com/article/10.1186/1471-2458-7-315) | 49 cases, 2002–03 |
| Hidden high blood pressure | 41% hypertensive; 59% undiagnosed; 11% controlled | [PLOS Medicine, rural Tanzanian districts](https://journals.plos.org/plosmedicine/article?id=10.1371%2Fjournal.pmed.1004140) | Adults screened in a few districts |
| Drug shop as first stop | 31% went first to an ADDO vs 30% to a public facility; ADDOs gave 49% of medicines | [PLOS ONE, Tanzania](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0164332) | Household survey in selected regions |
| Literacy, phones, internet (women vs men, 15–49) | 80% vs 87% literate; 59% vs 75% own a phone; 13% vs 26% used internet in last year | **In brief:** [Tanzania DHS-MIS 2022 summary](https://www.nbs.go.tz/nbs/takwimu/dhs/Tanzania_DHS-MIS_2022_Summary_Report_English_and_Swahili.pdf) ([DHS Program](https://dhsprogram.com/)) | National; rural-only figures need the full report |
| Women's mobile internet use, sub-Saharan Africa | 39% | **In brief:** [GSMA Mobile Gender Gap 2025](https://www.gsma.com/gender-gap-2025/) | Regional, not Tanzania-specific in the summary |
| First antenatal visit by month 4 | 31.9% rural vs 39.6% urban | [Tanzania DHS 2022 analysis, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12605227/) | — |
| Hypertensive disorders of pregnancy | ~16% of maternal deaths, ~42,000 in 2023 | [WHO pre-eclampsia fact sheet](https://www.who.int/news-room/fact-sheets/detail/pre-eclampsia) | Global, not Tanzania |
| Referral loop works in Tanzania | 89% of referrals completed (Afya-Tek, Kibaha) | [BMC Health Services Research](https://link.springer.com/article/10.1186/s12913-024-11302-7) | One district, funded programme |
| Clinic quality / provider knowledge | Pull Tanzania indicators | **In brief:** [Service Delivery Indicators, World Bank](https://www.worldbank.org/en/programs/service-delivery-indicators) | Facilities only, not drug shops — **to pull** |
| Health workforce density | Pull Tanzania value | **In brief:** [WHO Global Health Observatory](https://www.who.int/data/gho) | Country level — **to pull** |

## B. Data and models we build with

| Dataset / model | In brief? | Licence | Size | How we use it | Does not cover |
| --- | --- | --- | --- | --- | --- |
| `data/intent_seed.csv` (our Swahili/English symptom phrases) | No (ours) | CC-BY-4.0 (ours) | ~200 phrases (expand to 30–50 per label) | Train the intent model | **Synthetic**, written by the team; not real patient speech; no dialects, code-mixing or local languages; needs native-speaker review and field data |
| [MASSIVE](https://huggingface.co/datasets/AmazonScience/massive) `sw-KE` (Amazon) | Yes | CC-BY-4.0 | 11,514 train utterances per locale | "Other / not a symptom" examples so the model learns to say not sure | Virtual-assistant requests (alarms, music); no health content; Kenyan Swahili |
| [FLEURS](https://huggingface.co/datasets/google/fleurs) Swahili (Google) | Yes | CC-BY-4.0 | — | Benchmark speech-to-text word error rate (optional Phase 9) | Read Wikipedia sentences, not clinic speech |
| [Mozilla Common Voice](https://commonvoice.mozilla.org/) Swahili, via [Mozilla Data Collective](https://datacollective.mozillafoundation.org/) | Yes | CC0 (check datasheet) | — | Future: adapt speech model; contribute our recordings back | Read prompts, not spontaneous symptom descriptions; few rural older women |
| Whisper ([onnx-community/whisper-small](https://huggingface.co/onnx-community/whisper-small)) via Transformers.js | Related to MMS row | MIT | Hundreds of MB | Optional speech-to-text | Weak Swahili accuracy; no Chagga/Maa |
| [MMS](https://ai.meta.com/blog/multilingual-model-speech-recognition/) (Meta), e.g. [mms-tts-swh](https://huggingface.co/facebook/mms-tts-swh) | Yes | CC-BY-NC-4.0 | 36M params (TTS) | Future: Swahili voice prompts | Non-commercial licence; robotic voice; not on-device in browser today |
| NLLB-200 ([Xenova/nllb-200-distilled-600M](https://huggingface.co/Xenova/nllb-200-distilled-600M)); [AfriNLLB](https://huggingface.co/collections/AfriNLP/afrinllb) compressed variants | Yes (FLORES-200 / NLLB-200) | CC-BY-NC-4.0 | ~0.5–0.6B params | Optional Swahili ↔ English translation of notes | Non-commercial licence; medical terms untested; too large for 3G download |
| [OpenStreetMap](https://www.openstreetmap.org/) via Overpass (`scripts/fetch_facilities_osm.py`) | Yes | ODbL | — | Real clinics and pharmacies near the demo area | Incomplete drug shops; no hours, staff or stock |
| [healthsites.io](https://healthsites.io/) | Yes | ODbL | — | Alternative facility source | Same as OSM (built on it) |
| [Maina et al. public health facilities in sub-Saharan Africa](https://www.nature.com/articles/s41597-019-0142-2) ([figshare](https://springernature.figshare.com/collections/A_spatial_database_of_health_facilities_managed_by_the_public_health_sector_in_sub_Saharan_Africa/4399445/1)) | Yes | CC-BY-4.0 (check) | ~98,000 facilities | Public facility levels for referral targets | Public sector only; no private drug shops; 2019 snapshot |
| [MAP travel time to healthcare 2020](https://malariaatlas.org/project-resources/accessibility-to-healthcare/) (walking-only, motorised) | Yes | Open access (check) | 1 km rasters | Better travel-time estimate than straight line | Modelled; dry-season roads; 1 km cells |
| [OpenCelliD](https://opencellid.org/) | Yes | CC-BY-SA-4.0 | — | Show weak-signal areas to justify offline design | Crowdsourced; rural gaps |
| [DHIS2](https://dhis2.org/) | Yes | — | — | Shape referral and outbreak records like DHIS2/eIDSR fields | We do not connect to a live instance |
| [geoBoundaries](https://www.geoboundaries.org) gbOpen ADM1/ADM2 (`data/admin_areas.json`, built by `scripts/build_admin_areas.py`) | No | Per country, recorded in the file (CC BY 4.0, CC BY 3.0 IGO, CC BY-SA 2.0, ODbL, public domain …) | 19 countries, ~3,700 districts | Select-only region and district lists in setup (outside Tanzania) | Boundary vintages differ by country (e.g. recent district splits may be missing); names are as published, not localized; Tanzania not included (curated list used) |
| `data/facilities_sample.json`, `slots_sample.json`, `outbreak_counts_synthetic.csv` | No (ours) | CC-BY-4.0 (ours) | small | Repeatable demo | **Synthetic**; Ondera is fictional (from the brief) |

## C. Clinical sources behind `data/rules.json`

Every rule cites one of these. A clinician on the team must review each rule before the demo is recorded.

| Source | Used for |
| --- | --- |
| [Tanzania Standard Treatment Guidelines and NEMLIT, 6th ed., 2021](https://www.moh.go.tz/storage/app/uploads/public/663/c8f/ceb/663c8fceb418d132695047.pdf) | National guidance, antenatal (11.7) and postpartum (11.8) care, facility levels |
| [WHO ANC recommendations for a positive pregnancy experience, 2016](https://www.who.int/publications/i/item/9789241549912) | Pregnancy danger signs, BP thresholds |
| [WHO maternal and newborn care for a positive postnatal experience, 2022](https://www.ncbi.nlm.nih.gov/books/NBK579660/) | Postpartum danger signs, mood |
| [WHO IMCI chart booklet, 2014](https://cdn.who.int/media/docs/default-source/mca-documents/child/imci-integrated-management-of-childhood-illness/imci-in-service-training/imci-chart-booklet.pdf?sfvrsn=f63af425_1) | Child general danger signs, fever, diarrhoea, cough |
| [WHO pre-eclampsia fact sheet](https://www.who.int/news-room/fact-sheets/detail/pre-eclampsia) | ≥140/90 after 20 weeks, severe symptoms |
| [WHO ICD-10 browser, 2019 version](https://icd.who.int/browse10/2019/en) | Draft codes in `data/icd10_draft.json` (Tanzania codes with ICD-10 in DHIS2 since 2014: [BMC HSR](https://link.springer.com/article/10.1186/s12913-021-06189-7)) |
| [Tanzania eIDSR](https://dhis2.udsm.ac.tz/project/integrated-disease-surveillance-and-response-eidsr-system-mainland-ussd-android-and-web/); [WHO AFRO IDSR technical guidelines](https://www.afro.who.int/sites/default/files/2017-06/IDSR-Technical-Guidelines_Final_2010_0.pdf) | Escalation fields, immediately notifiable conditions |
