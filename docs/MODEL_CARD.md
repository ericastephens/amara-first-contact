# Model card: Amara intent model

| | |
| --- | --- |
| Name | `amara-intent-charngram-lr` (version in `public/models/intent_model.json`) |
| Task | Sort a mother's own words (Swahili or English) into a **fixed list** of 21 symptoms/exposures + "other" (`data/intent_labels.json`) |
| Architecture | Character n-grams (2–4, word-bounded, sklearn `char_wb`) → TF-IDF → multinomial logistic regression |
| Size | ~660 KB JSON (< 1 MB; side-loadable, sendable over weak 3G) |
| Runtime | Plain TypeScript in the browser (`src/ai/intent.ts`), on device, offline. No network call at inference |
| Training code | `scripts/train_intent.py` · reference JS: `scripts/intent_reference.mjs` |
| Parity | `tests/intent.test.ts` checks the TypeScript port against the Python export: max difference < 1e-6 (measured 5e-9) |
| Threshold | 0.40 (stored in the model file). Below it, the chunk is shown as a grey **"Not sure"** chip |

## What it does in the app

1. The responder types her words. The text is split on punctuation and on "na / and / pia / also".
2. Each chunk is classified. Labels ≥ 0.40 become chips the responder **confirms or removes**; only confirmed chips
   become symptom ids. Chunks below 0.40 become "Not sure" chips.
3. The model **never decides urgency**. `data/rules.json` does, through the rules engine (`src/logic/rules.ts`).
4. If no rule fires and a "Not sure" chunk is open, the result is **"Not sure — ask the clinic"**.

## Training data

- `data/intent_seed.csv`: ~200 phrases written by the team (synthetic), Swahili and English, pending native-speaker review.
- Optional: 300 MASSIVE `sw-KE` utterances as "other" (`--massive`), so the model learns what is *not* a symptom.

## Metrics

See `docs/MODEL_REPORT.md` (regenerated on every training run). Current: held-out accuracy 0.58 on a 50-row split;
0.75 accuracy on the 40% of rows where confidence ≥ 0.40 (the rest return "not sure"). The held-out set is tiny, so
treat these as optimistic.

## Limits

- Synthetic phrases, not real patient speech. No Sheng, little code-mixing, no Chagga/Maa.
- Weak labels with few examples (e.g. `lethargic`, `rash`, `swelling_face_hands`) score 0 recall on the held-out split.
  The keypad questions cover every label, so the journey never depends on the model.
- Before any pilot: collect 30–50 consented, real phrases per label from the field, mark them separately, retrain.
