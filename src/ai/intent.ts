// Small intent model: char n-gram TF-IDF + multinomial logistic regression, trained in Python
// (scripts/train_intent.py) and exported to public/models/intent_model.json.
// Port of scripts/intent_reference.mjs, unchanged in behaviour (parity test: tests/intent.test.ts).
// The model only sorts words into the fixed list in data/intent_labels.json. It never decides urgency.

export interface IntentModel {
  name: string;
  version: string;
  labels: string[];
  threshold: number;
  vectorizer: { ngram_range: [number, number] };
  vocabulary: Record<string, number>;
  idf: number[];
  coef: number[][];
  intercept: number[];
}

export interface Prediction {
  /** Top label, or "uncertain" when confidence is below model.threshold. */
  label: string;
  topLabel: string;
  confidence: number;
  probs: Record<string, number>;
}

export interface DetectedSymptom {
  id: string;
  text: string;
  confidence: number;
}

export interface UncertainChunk {
  text: string;
  best: string;
  confidence: number;
}

export interface Detection {
  symptoms: DetectedSymptom[];
  uncertain: UncertainChunk[];
}

export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// sklearn _char_wb_ngrams
function charWbNgrams(text: string, minN: number, maxN: number): string[] {
  const grams: string[] = [];
  for (const word of text.split(" ").filter(Boolean)) {
    const w = " " + word + " ";
    const wLen = [...w].length; // normalised text is ASCII, so length === code points
    for (let n = minN; n <= maxN; n++) {
      let offset = 0;
      grams.push(w.slice(offset, offset + n));
      while (offset + n < wLen) {
        offset += 1;
        grams.push(w.slice(offset, offset + n));
      }
      if (offset === 0) break; // short word counted once
    }
  }
  return grams;
}

export function predict(model: IntentModel, rawText: string): Prediction {
  const text = normalize(rawText);
  const [minN, maxN] = model.vectorizer.ngram_range;
  const x = new Float64Array(model.idf.length);
  for (const g of charWbNgrams(text, minN, maxN)) {
    const idx = model.vocabulary[g];
    if (idx !== undefined) x[idx] += 1;
  }
  let norm = 0;
  for (let i = 0; i < x.length; i++) {
    x[i] *= model.idf[i];
    norm += x[i] * x[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < x.length; i++) x[i] /= norm;
  const z = model.coef.map((row, k) => {
    let s = model.intercept[k];
    for (let i = 0; i < row.length; i++) if (x[i] !== 0) s += row[i] * x[i];
    return s;
  });
  const max = Math.max(...z);
  const e = z.map((v) => Math.exp(v - max));
  const sum = e.reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(model.labels.map((l, k) => [l, e[k] / sum]));
  const [label, p] = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
  return { label: p >= model.threshold ? label : "uncertain", topLabel: label, confidence: p, probs };
}

/** Multi-symptom input: split on punctuation and on the joining words "na" / "and" / "pia" / "also". */
export function splitChunks(rawText: string): string[] {
  return rawText
    .split(/[,.;!?\n]+|\s+(?:na|and|pia|also)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

export function detect(model: IntentModel, rawText: string): Detection {
  const found = new Map<string, { text: string; confidence: number }>();
  const uncertain: UncertainChunk[] = [];
  for (const c of splitChunks(rawText)) {
    const r = predict(model, c);
    if (r.label === "uncertain") uncertain.push({ text: c, best: r.topLabel, confidence: r.confidence });
    else if (r.label !== "other") {
      const prev = found.get(r.label);
      if (!prev || prev.confidence < r.confidence) found.set(r.label, { text: c, confidence: r.confidence });
    }
  }
  return { symptoms: [...found.entries()].map(([id, v]) => ({ id, ...v })), uncertain };
}
