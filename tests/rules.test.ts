import { describe, expect, it } from "vitest";
import { icd10, rulesDoc, testCases } from "../src/data";
import { applyDecisions, evaluate } from "../src/logic/rules";
import { motherView } from "../src/logic/views";

describe("rules engine: golden cases (data/test_cases.json)", () => {
  for (const c of testCases.cases) {
    it(`${c.id}: ${c.label}`, () => {
      const r = evaluate(rulesDoc, icd10, c.encounter);
      expect(r.urgency).toBe(c.expected.urgency);
      const fired = r.fired.map((f) => f.id);
      for (const id of c.expected.must_fire) expect(fired).toContain(id);
      const codes = r.ruleOut.map((x) => x.code);
      for (const code of c.expected.rule_out_includes) expect(codes).toContain(code);

      // the Mother view never carries rule-outs, codes or reasons
      const mv = JSON.stringify(motherView(rulesDoc, r, { clinic: "X", code: "K47", provisional: true }, "sw"));
      for (const ro of r.ruleOut) {
        expect(mv).not.toContain(ro.code);
        expect(mv).not.toContain(ro.title);
      }
      for (const f of r.fired) {
        expect(mv).not.toContain(f.reason.sw);
        expect(mv).not.toContain(f.reason.en);
      }
    });
  }
});

describe("rules engine details", () => {
  it("every fired rule carries its source", () => {
    for (const c of testCases.cases) {
      for (const f of evaluate(rulesDoc, icd10, c.encounter).fired) {
        expect(f.sourceTitle.length).toBeGreaterThan(0);
        expect(f.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it("lists a missing gestational age as unanswered", () => {
    const r = evaluate(rulesDoc, icd10, { group: "pregnant", symptoms: ["headache"], answers: {} });
    expect(r.unanswered).toContain("q_gest_weeks");
  });

  it("lists a missing BP reading as a question that could change the result", () => {
    const r = evaluate(rulesDoc, icd10, { group: "pregnant", gest_weeks: 30, symptoms: [], answers: {} });
    expect(r.unanswered).toContain("q_bp");
  });

  it("rule-out codes are always drafts", () => {
    const r = evaluate(rulesDoc, icd10, testCases.cases[0].encounter);
    expect(r.ruleOut.every((x) => x.draft)).toBe(true);
  });

  it("overriding a flag needs a reason and recomputes urgency", () => {
    const r = evaluate(rulesDoc, icd10, testCases.cases[0].encounter); // demo_1: refer_today
    expect(() =>
      applyDecisions(rulesDoc, icd10, r, [{ ruleId: "fever_not_cleared_any", decision: "override" }], false),
    ).toThrow();
    const after = applyDecisions(
      rulesDoc,
      icd10,
      r,
      [
        { ruleId: "fever_not_cleared_any", decision: "override", reason: "Tested at dispensary yesterday" },
        { ruleId: "fever_water_rats_exposure", decision: "override", reason: "Tested at dispensary yesterday" },
        { ruleId: "bp_never_checked", decision: "confirm" },
      ],
      false,
    );
    expect(after.urgency).toBe("refer_routine");
  });
});
