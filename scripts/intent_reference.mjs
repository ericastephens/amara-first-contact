// Reference implementation of the intent model in plain JavaScript (no dependencies).
// Port this to src/ai/intent.ts in Phase 4. It reproduces sklearn's char_wb TF-IDF + logistic regression.
// Run the parity check:  node scripts/intent_reference.mjs
import { readFileSync } from "node:fs";

export function normalize(text) {
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
function charWbNgrams(text, minN, maxN) {
  const grams = [];
  for (const word of text.split(" ").filter(Boolean)) {
    const w = " " + word + " ";
    const wLen = [...w].length; // our normalised text is ASCII, so length === code points
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

export function predict(model, rawText) {
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

// Multi-symptom input: split on punctuation and on the joining words "na" / "and" / "pia" / "also".
export function detect(model, rawText) {
  const chunks = rawText
    .split(/[,.;!?\n]+|\s+(?:na|and|pia|also)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const found = new Map();
  const uncertain = [];
  for (const c of chunks) {
    const r = predict(model, c);
    if (r.label === "uncertain") uncertain.push({ text: c, best: r.topLabel, confidence: r.confidence });
    else if (r.label !== "other") {
      if (!found.has(r.label) || found.get(r.label).confidence < r.confidence) found.set(r.label, { text: c, confidence: r.confidence });
    }
  }
  return { symptoms: [...found.entries()].map(([id, v]) => ({ id, ...v })), uncertain };
}

// ---- parity check against the Python export -------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const model = JSON.parse(readFileSync(new URL("../public/models/intent_model.json", import.meta.url)));
  const fixtures = JSON.parse(readFileSync(new URL("../tests/fixtures/intent_parity.json", import.meta.url)));
  let worst = 0;
  for (const f of fixtures) {
    if (normalize(f.text) !== f.normalized) throw new Error(`normalize mismatch: ${f.text}`);
    const { probs } = predict(model, f.text);
    for (const [k, v] of Object.entries(f.probs)) worst = Math.max(worst, Math.abs(probs[k] - v));
  }
  console.log(`parity: max abs difference ${worst.toExponential(2)} over ${fixtures.length} fixtures`);
  if (worst > 1e-6) process.exit(1);
  const demo = "Nilimeza dawa za mseto lakini homa bado ipo, na kichwa kinauma sana. Kuna panya wengi nyumbani";
  console.log("demo:", JSON.stringify(detect(model, demo), null, 1));
}
