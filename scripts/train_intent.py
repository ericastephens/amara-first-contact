"""Train the small intent model and export it to JSON for the browser.

Model: character n-grams (2-4, word-bounded) -> TF-IDF -> multinomial logistic regression.
Small (< 1 MB), fast, explainable, runs offline in plain TypeScript. It only ever outputs labels from
data/intent_labels.json; low confidence means "not sure".

Usage:
  pip install scikit-learn pandas
  python scripts/train_intent.py              # seed phrases only
  python scripts/train_intent.py --massive    # + MASSIVE sw-KE utterances as "other" (pip install datasets; needs internet)

Writes:
  public/models/intent_model.json       model for the app
  tests/fixtures/intent_parity.json     inputs + expected probabilities for the TypeScript parity test
  docs/MODEL_REPORT.md                  accuracy, per-label scores, size, limits
"""
import argparse
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent.parent
THRESHOLD = 0.40
NGRAM = (2, 4)
MAX_FEATURES = 4000
DECIMALS = 5


def normalize(text: str) -> str:
    """Must match normalize() in src/ai/intent.ts exactly."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("’", "'")
    text = re.sub(r"[^a-z0-9']+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def load_data(use_massive: bool) -> pd.DataFrame:
    df = pd.read_csv(ROOT / "data" / "intent_seed.csv")
    df["source"] = "seed_synthetic"
    if use_massive:
        from datasets import load_dataset  # type: ignore

        ds = load_dataset("AmazonScience/massive", "sw-KE", split="train")
        # health-free assistant requests become "other" so the model learns what is NOT a symptom
        sample = ds.shuffle(seed=7).select(range(300))
        extra = pd.DataFrame({"label": "other", "lang": "sw", "text": sample["utt"], "source": "massive_sw-KE"})
        df = pd.concat([df, extra], ignore_index=True)
    df["norm"] = df["text"].map(normalize)
    return df


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--massive", action="store_true")
    args = ap.parse_args()

    labels_doc = json.loads((ROOT / "data" / "intent_labels.json").read_text(encoding="utf-8"))
    allowed = [l["id"] for l in labels_doc["labels"]]
    df = load_data(args.massive)
    unknown = set(df["label"]) - set(allowed)
    if unknown:
        raise SystemExit(f"Labels not in intent_labels.json: {unknown}")

    vec_kwargs = dict(analyzer="char_wb", ngram_range=NGRAM, lowercase=False, max_features=MAX_FEATURES,
                      sublinear_tf=False, smooth_idf=True, norm="l2")

    # held-out evaluation
    tr, te = train_test_split(df, test_size=0.25, random_state=42, stratify=df["label"])
    v = TfidfVectorizer(**vec_kwargs)
    clf = LogisticRegression(max_iter=5000, C=50)
    clf.fit(v.fit_transform(tr["norm"]), tr["label"])
    proba = clf.predict_proba(v.transform(te["norm"]))
    pred = clf.classes_[proba.argmax(1)]
    conf = proba.max(1)
    report = classification_report(te["label"], pred, zero_division=0)
    acc = float((pred == te["label"].values).mean())
    confident = conf >= THRESHOLD
    acc_conf = float((pred[confident] == te["label"].values[confident]).mean()) if confident.any() else float("nan")

    # final model on all data
    v = TfidfVectorizer(**vec_kwargs)
    X = v.fit_transform(df["norm"])
    clf = LogisticRegression(max_iter=5000, C=50)
    clf.fit(X, df["label"])

    vocab = {k: int(i) for k, i in v.vocabulary_.items()}
    model = {
        "name": "amara-intent-charngram-lr",
        "version": date.today().isoformat(),
        "labels": list(clf.classes_),
        "threshold": THRESHOLD,
        "preprocess": "NFKD, drop combining marks, lowercase, ’ -> ', non [a-z0-9'] -> space, collapse spaces",
        "vectorizer": {"analyzer": "char_wb", "ngram_range": list(NGRAM), "norm": "l2", "smooth_idf": True, "sublinear_tf": False},
        "vocabulary": vocab,
        "idf": [round(float(x), DECIMALS) for x in v.idf_],
        "coef": [[round(float(x), DECIMALS) for x in row] for row in clf.coef_],
        "intercept": [round(float(x), DECIMALS) for x in clf.intercept_],
        "training_data": {"rows": int(len(df)), "sources": df["source"].value_counts().to_dict(), "synthetic": True},
    }
    out = ROOT / "public" / "models" / "intent_model.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = out.stat().st_size / 1024

    # parity fixture: recompute probabilities from the ROUNDED exported weights, as the browser will
    W, b, idf = np.array(model["coef"]), np.array(model["intercept"]), np.array(model["idf"])
    samples = [
        "Nilimeza dawa za mseto lakini homa bado ipo",
        "kichwa kinauma sana na naona giza giza",
        "mtoto ana upele na homa",
        "natoka damu nyingi tangu nijifungue",
        "nataka kununua sabuni",
        "Nina ng’ombe watatu na mbuzi",
        "xyz qwerty",
    ]
    fixtures = []
    for s in samples:
        tf = v.transform([normalize(s)])  # sparse tf-idf with unrounded idf -> rebuild with rounded idf
        counts = TfidfVectorizer(**{**vec_kwargs, "use_idf": False, "norm": None}, vocabulary=v.vocabulary_).fit_transform([normalize(s)])
        x = counts.toarray()[0] * idf
        n = np.linalg.norm(x)
        x = x / n if n > 0 else x
        z = W @ x + b
        p = np.exp(z - z.max())
        p = p / p.sum()
        fixtures.append({"text": s, "normalized": normalize(s), "probs": {lab: round(float(pp), 8) for lab, pp in zip(model["labels"], p)}})
    fx = ROOT / "tests" / "fixtures" / "intent_parity.json"
    fx.parent.mkdir(parents=True, exist_ok=True)
    fx.write_text(json.dumps(fixtures, ensure_ascii=False, indent=1), encoding="utf-8")

    rep = ROOT / "docs" / "MODEL_REPORT.md"
    rep.write_text(f"""# Intent model report

Generated by `scripts/train_intent.py` on {date.today().isoformat()}.

| Item | Value |
| --- | --- |
| Model | char n-gram ({NGRAM[0]}-{NGRAM[1]}) TF-IDF + multinomial logistic regression |
| File | `public/models/intent_model.json`, {size_kb:.0f} KB |
| Training rows | {len(df)} ({', '.join(f'{k}: {v}' for k, v in model['training_data']['sources'].items())}) |
| Labels | {len(model['labels'])} (fixed list in `data/intent_labels.json`) |
| Held-out accuracy (25% split) | {acc:.2f} |
| Accuracy when confidence >= {THRESHOLD} | {acc_conf:.2f} on {int(confident.sum())} of {len(te)} held-out rows; the rest return "not sure" |

## Per-label scores (held-out)

```
{report}
```

## Limits (say these in the video)

- Training phrases are **synthetic**: written by the team, pending native-speaker review. Not real patient speech.
- Swahili and English only. No Chagga, Maa or other local languages; no code-mixing beyond a few phrases.
- Held-out set is small, so the accuracy above is optimistic. Field data with consent is needed before any pilot.
- The model only sorts words into a fixed list; it never decides urgency. The rules in `data/rules.json` do.
""", encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)} ({size_kb:.0f} KB), accuracy {acc:.2f}, confident accuracy {acc_conf:.2f}")


if __name__ == "__main__":
    main()
