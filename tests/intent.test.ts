import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detect, normalize, predict, splitChunks, type IntentModel } from "../src/ai/intent";
import { intentLabels } from "../src/data";

const model: IntentModel = JSON.parse(readFileSync(new URL("../public/models/intent_model.json", import.meta.url), "utf8"));
const fixtures: { text: string; normalized: string; probs: Record<string, number> }[] = JSON.parse(
  readFileSync(new URL("./fixtures/intent_parity.json", import.meta.url), "utf8"),
);

describe("intent model", () => {
  it("matches the Python export within 1e-6 (parity)", () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      expect(normalize(f.text)).toBe(f.normalized);
      const { probs } = predict(model, f.text);
      for (const [k, v] of Object.entries(f.probs)) expect(Math.abs(probs[k] - v)).toBeLessThan(1e-6);
    }
  });

  it("is small enough to side-load (< 1 MB)", () => {
    const bytes = readFileSync(new URL("../public/models/intent_model.json", import.meta.url)).length;
    expect(bytes).toBeLessThan(1024 * 1024);
  });

  it("only outputs labels from data/intent_labels.json", () => {
    const ids = new Set(intentLabels.labels.map((l) => l.id));
    for (const l of model.labels) expect(ids.has(l)).toBe(true);
  });

  it("uses the 0.40 threshold from the model file", () => {
    expect(model.threshold).toBe(0.4);
  });

  it("detects the demo sentence as fever not cleared + headache", () => {
    const r = detect(model, "nilimeza dawa za mseto lakini homa bado ipo, na kichwa kinauma");
    const ids = r.symptoms.map((s) => s.id);
    expect(ids).toContain("fever_not_cleared");
    expect(ids).toContain("headache");
  });

  it("splits on punctuation and joining words", () => {
    expect(splitChunks("homa, na kichwa kinauma. pia natapika")).toEqual(["homa", "kichwa kinauma", "natapika"]);
  });

  it("says not sure instead of guessing on unrelated text", () => {
    const r = predict(model, "zzzz qqqq");
    expect(r.label === "uncertain" || r.label === "other").toBe(true);
  });
});

describe("explain: what the small AI heard", () => {
  it("gives one reading per chunk in order, with Not sure for vague words", async () => {
    const { explain } = await import("../src/ai/intent");
    const m = JSON.parse(readFileSync(new URL("../public/models/intent_model.json", import.meta.url), "utf8"));
    const r = explain(m, "Kichwa kinaniuma sana, naona giza giza, miguu imevimba, na nimechoka");
    expect(r.map((x) => x.label)).toEqual(["headache", "blurred_vision", "swelling_face_hands", "uncertain"]);
    expect(r[3].confidence).toBeLessThan(m.threshold);
    expect(r[0].text).toBe("Kichwa kinaniuma sana");
  });
});
