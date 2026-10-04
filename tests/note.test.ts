import { describe, expect, it } from "vitest";
import { icd10, intentLabels, questionnaires, rulesDoc, testCases } from "../src/data";
import { answersForSymptoms, encounterFromCase, questionFor, visibleUnanswered } from "../src/logic/encounter";
import { buildNote } from "../src/logic/note";
import { evaluate } from "../src/logic/rules";

const noorCase = testCases.cases.find((c) => c.id === "demo_1")!;
const noor = encounterFromCase("demo_1", noorCase.encounter, "2026-10-05T14:00:00Z", "enc1", "Noor");
const ctx = { questionnaires, labels: intentLabels, urgencyLabel: "Refer today", responder: "Duka la Dawa Ondera" };

describe("referral note", () => {
  const result = evaluate(rulesDoc, icd10, noorCase.encounter);
  const note = buildNote(noor, result, [], { ...ctx, languageName: (c) => (c === "sw" ? "Kiswahili" : c) });

  it("says the referral is pending, never 'No referral', when the result refers", () => {
    expect(note).toContain("Referral pending");
    expect(note).not.toContain("No referral");
  });
  it("does not list the self-harm question when low mood was not reported", () => {
    expect(note).not.toMatch(/harming yourself/);
  });
  it("uses the wording of the question shown to this group", () => {
    expect(note).toContain(questionFor(questionnaires, "q_bp_ever_checked", "adult_other")!.en);
    expect(note).not.toContain("since the birth");
  });
  it("prints labels, not raw option codes", () => {
    expect(note).toContain("Kiswahili");
    expect(note).toContain("Reads SMS");
    expect(note).not.toMatch(/\? sw$/m);
  });
});

describe("encounter helpers", () => {
  it("questionFor prefers the group's own module", () => {
    expect(questionFor(questionnaires, "q_selfharm", "adult_other")?.show_if).toEqual({ q_mood_adult: "yes" });
    expect(questionFor(questionnaires, "q_selfharm", "postpartum")?.show_if).toEqual({ q_mood: "yes" });
  });
  it("visibleUnanswered hides questions whose show_if parent is not yes", () => {
    expect(visibleUnanswered(questionnaires, { group: "adult_other", answers: {} }, ["q_selfharm"])).toEqual([]);
    expect(visibleUnanswered(questionnaires, { group: "adult_other", answers: { q_mood_adult: "yes" } }, ["q_selfharm"])).toEqual(["q_selfharm"]);
  });
  it("answersForSymptoms answers a question and the parents needed to reach it", () => {
    expect(answersForSymptoms(questionnaires, "adult_other", ["fever_not_cleared"])).toEqual({
      q_fever_after_meds: "yes",
      q_malaria_meds: "yes",
      q_fever: "yes",
    });
  });
});
