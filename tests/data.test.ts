import { describe, expect, it } from "vitest";
import {
  facilitiesDoc,
  icd10,
  intentLabels,
  outbreakRows,
  questionnaires,
  rulesDoc,
  slotsDoc,
  smsDoc,
  testCases,
} from "../src/data";
import { allQuestions } from "../src/logic/encounter";

const labelIds = new Set(intentLabels.labels.map((l) => l.id));
const questionIds = new Set(allQuestions(questionnaires).map((q) => q.id));
const mapsTo = new Set(allQuestions(questionnaires).flatMap((q) => (q.maps_to ? [q.maps_to] : [])));
const codes = new Set(icd10.codes.map((c) => c.code));

describe("data files load and validate", () => {
  it("loads every file", () => {
    expect(rulesDoc.rules.length).toBeGreaterThan(0);
    expect(questionnaires.groups).toHaveLength(5);
    expect(Object.keys(smsDoc.templates)).toContain("referral");
    expect(facilitiesDoc.facilities.length).toBeGreaterThan(0);
    expect(slotsDoc.slots.length).toBeGreaterThan(0);
    expect(testCases.cases.length).toBe(19);
    expect(outbreakRows.length).toBe(128);
  });

  it("marks sample data as synthetic", () => {
    expect(facilitiesDoc.synthetic).toBe(true);
    expect(slotsDoc.synthetic).toBe(true);
    expect(outbreakRows.every((r) => r.synthetic)).toBe(true);
  });
});

describe("cross-references", () => {
  it("every rule references symptom ids that exist", () => {
    for (const r of rulesDoc.rules) {
      for (const s of [...(r.when.all ?? []), ...(r.when.any ?? [])]) {
        expect(labelIds.has(s) || mapsTo.has(s), `${r.id}: ${s}`).toBe(true);
      }
    }
  });

  it("every questionnaire maps_to is an intent label", () => {
    for (const m of mapsTo) expect(labelIds.has(m), m).toBe(true);
  });

  it("every rule's answers keys are question ids", () => {
    for (const r of rulesDoc.rules) for (const k of Object.keys(r.when.answers ?? {})) expect(questionIds.has(k), `${r.id}: ${k}`).toBe(true);
  });

  it("every rule has a non-empty, known source", () => {
    for (const r of rulesDoc.rules) {
      expect(r.source.length, r.id).toBeGreaterThan(0);
      expect(rulesDoc.sources[r.source], r.id).toBeDefined();
    }
  });

  it("every ICD-10 code in rules exists in icd10_draft.json", () => {
    for (const r of rulesDoc.rules) for (const c of r.rule_out) expect(codes.has(c), `${r.id}: ${c}`).toBe(true);
  });

  it("every slot belongs to a known facility", () => {
    const ids = new Set(facilitiesDoc.facilities.map((f) => f.id));
    for (const s of slotsDoc.slots) expect(ids.has(s.facility_id)).toBe(true);
  });
});
