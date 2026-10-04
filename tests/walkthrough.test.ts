// Fixes from the demo walkthrough: note plan/answers/time, unanswered questions, group-aware
// question text, slot after the current time, and Demo mode starting at the free-text step.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detect, type IntentModel } from "../src/ai/intent";
import { icd10, intentLabels, questionnaires, rulesDoc, slotsDoc, testCases } from "../src/data";
import {
  demoEncounterFromCase,
  newEncounter,
  questionForGroup,
  toEncounterInput,
  visibleUnanswered,
  type Encounter,
} from "../src/logic/encounter";
import { buildNote, type NoteContext } from "../src/logic/note";
import { chooseReferral, pickSlot } from "../src/logic/referral";
import { evaluate } from "../src/logic/rules";
import { localDateTime, localTime } from "../src/logic/time";
import { urgencyLabel } from "../src/logic/views";
import { facilitiesDoc } from "../src/data";

const NOW = "2026-10-05T09:00:00Z";
const roles = { has_bp_cuff: true };

function enc(group: Encounter["group"], answers: Record<string, string> = {}): Encounter {
  const e = newEncounter(group, NOW, "enc-test");
  e.answers = answers;
  return e;
}

function ctx(urgency: Parameters<typeof urgencyLabel>[1], referral?: NoteContext["referral"]): NoteContext {
  return {
    questionnaires,
    labels: intentLabels,
    urgencyLabel: urgencyLabel(rulesDoc, urgency, "en"),
    responder: "Test shop",
    referral,
  };
}

function noteFor(e: Encounter, referral?: NoteContext["referral"]) {
  const result = evaluate(rulesDoc, icd10, toEncounterInput(questionnaires, e));
  return { result, note: buildNote(e, result, [], ctx(result.urgency, referral)) };
}

describe("note PLAN section", () => {
  it("says the referral is pending (never 'No referral') before the responder creates it", () => {
    for (const c of testCases.cases) {
      const result = evaluate(rulesDoc, icd10, c.encounter);
      if (result.urgency !== "refer_today" && result.urgency !== "go_now") continue;
      const e = enc(c.encounter.group, c.encounter.answers);
      const note = buildNote(e, result, [], ctx(result.urgency));
      expect(note).toContain(`Referral pending responder confirmation (urgency: ${urgencyLabel(rulesDoc, result.urgency, "en")})`);
      expect(note).not.toContain("No referral");
    }
  });

  it("names clinic, slot and code once the referral exists", () => {
    const e = enc("adult_other", { q_fever: "yes", q_malaria_meds: "yes", q_fever_after_meds: "yes" });
    const { note } = noteFor(e, { clinic: "Ondera Dispensary", date: "2026-10-05", time: "14:00", code: "K47", provisional: true });
    expect(note).toContain("Referred to Ondera Dispensary, slot 2026-10-05 14:00 (provisional until sync). Code K47.");
    expect(note).not.toContain("pending responder confirmation");
  });
});

describe("note answers and time", () => {
  it("prints option labels in the staff language, not raw values", () => {
    const e = enc("adult_other", { q_language: "sw", q_reader: "reads_sms", q_farmer: "yes" });
    const { note } = noteFor(e);
    expect(note).toContain("Preferred language for messages? Swahili");
    expect(note).toContain("Can you read SMS, or would you prefer a voice call? Reads SMS");
    expect(note).not.toMatch(/\breads_sms\b/);
    expect(note).not.toMatch(/\? (sw|yes)$/m);
    expect(noteFor(enc("adult_other", { q_consent: "yes" })).note).toContain("Consent to share referral and send SMS/calls: Yes");
  });

  it("shows the header time in the device's local time zone", () => {
    const local = new Date(2026, 9, 5, 14, 2); // 14:02 on the device clock, whatever the zone
    expect(localDateTime(local)).toBe("2026-10-05 14:02");
    expect(localTime(local.toISOString())).toBe("14:02");
    const e = enc("adult_other");
    e.createdAt = local.toISOString();
    expect(noteFor(e).note).toContain("AMARA REFERRAL NOTE  ·  2026-10-05 14:02");
  });
});

describe("unanswered questions", () => {
  const selfharmListed = (e: Encounter) => {
    const r = evaluate(rulesDoc, icd10, toEncounterInput(questionnaires, e));
    return visibleUnanswered(questionnaires, e, r.unanswered, roles).includes("q_selfharm");
  };

  it("never lists q_selfharm unless its low-mood parent was answered yes", () => {
    const parent = { pregnant: "q_mood_preg", postpartum: "q_mood", stillbirth: "q_mood", adult_other: "q_mood_adult" } as const;
    for (const [group, moodQ] of Object.entries(parent)) {
      const g = group as keyof typeof parent;
      expect(selfharmListed(enc(g)), `${g}: mood not asked`).toBe(false);
      expect(selfharmListed(enc(g, { [moodQ]: "no" })), `${g}: mood no`).toBe(false);
      expect(selfharmListed(enc(g, { [moodQ]: "dont_know" })), `${g}: mood don't know`).toBe(false);
      expect(selfharmListed(enc(g, { [moodQ]: "yes" })), `${g}: mood yes`).toBe(true);
    }
  });

  it("does not list questions from another group's module, and skips BP without a cuff", () => {
    const e = enc("adult_other", { q_mood_preg: "yes" });
    expect(visibleUnanswered(questionnaires, e, ["q_selfharm"], roles)).toEqual([]);
    expect(visibleUnanswered(questionnaires, e, ["q_bp"], { has_bp_cuff: false })).toEqual([]);
    expect(visibleUnanswered(questionnaires, e, ["q_bp"], roles)).toEqual(["q_bp"]);
  });

  it("the note only lists visible unanswered questions", () => {
    const { note } = noteFor(enc("adult_other"));
    expect(note).not.toContain("thoughts of harming yourself");
  });
});

describe("question lookup by group", () => {
  it("uses the adult_screen module for adult_other when ids are shared", () => {
    const selfharm = questionForGroup(questionnaires, "q_selfharm", "adult_other");
    expect(selfharm?.show_if).toEqual({ q_mood_adult: "yes" });
    const adultModule = questionnaires.modules.find((m) => m.id === "adult_screen")!;
    const bp = questionForGroup(questionnaires, "q_bp_ever_checked", "adult_other");
    expect(bp).toBe(adultModule.questions.find((q) => q.id === "q_bp_ever_checked"));
  });

  it("uses each group's own module for the shared ids", () => {
    expect(questionForGroup(questionnaires, "q_selfharm", "pregnant")?.show_if).toEqual({ q_mood_preg: "yes" });
    expect(questionForGroup(questionnaires, "q_selfharm", "postpartum")?.show_if).toEqual({ q_mood: "yes" });
    expect(questionForGroup(questionnaires, "q_selfharm", "child")).toBeUndefined();
    expect(questionForGroup(questionnaires, "q_bp", "child")?.type).toBe("bp");
  });
});

describe("slot after the current time", () => {
  const today = slotsDoc.demo_today;
  const free = (fid: string, date: string) =>
    slotsDoc.slots.filter((s) => s.facility_id === fid && s.date === date && s.status === "free").map((s) => s.time).sort();

  it("takes the first free slot after now", () => {
    const times = free("F1", today);
    expect(times.length).toBeGreaterThan(0);
    const before = pickSlot("refer_today", "F1", slotsDoc.slots, today, new Set(), undefined, "06:00");
    expect(before).toMatchObject({ date: today, time: times[0] });
    // exactly at a slot's time: that slot has started, take a later one or the next day
    const at = pickSlot("refer_today", "F1", slotsDoc.slots, today, new Set(), undefined, times[0]);
    expect(at && `${at.date} ${at.time}` > `${today} ${times[0]}`).toBe(true);
  });

  it("moves to the next day when nothing is free later today", () => {
    const tomorrow = "2026-10-06";
    const s = pickSlot("refer_today", "F1", slotsDoc.slots, today, new Set(), undefined, "23:00");
    expect(s).toMatchObject({ date: tomorrow, time: free("F1", tomorrow)[0] });
  });

  it("prefers a slot today at any suitable facility over tomorrow at the nearest", () => {
    const from = facilitiesDoc.responder_sites[0];
    const latestToday = slotsDoc.slots
      .filter((s) => s.date === today && s.status === "free")
      .map((s) => s.time)
      .sort()
      .at(-1)!;
    const r = chooseReferral("refer_today", "dispensary", facilitiesDoc.facilities, from, slotsDoc.slots, today, new Set(), "06:00");
    expect(r?.slot?.date).toBe(today);
    const late = chooseReferral("refer_today", "dispensary", facilitiesDoc.facilities, from, slotsDoc.slots, today, new Set(), latestToday);
    expect(late?.slot?.date).toBe("2026-10-06");
  });
});

describe("Demo mode", () => {
  const model = JSON.parse(readFileSync("public/models/intent_model.json", "utf8")) as IntentModel;

  for (const id of ["demo_1", "demo_2", "demo_3"]) {
    it(`${id} starts with her sentence; once the responder confirms the chips the result matches`, () => {
      const c = testCases.cases.find((x) => x.id === id)!;
      expect(c.encounter.free_text).toBeTruthy();
      const detection = detect(model, c.encounter.free_text!);
      const detected = detection.symptoms.map((s) => s.id);
      expect(detected.length).toBeGreaterThan(0);

      const e = demoEncounterFromCase(questionnaires, id, c.encounter, NOW, "enc-demo", "Noor", detected);
      expect(e.answers.q_complaint).toBe(c.encounter.free_text);
      // the model's labels are not pre-confirmed: the chips come from the intake, for the responder to confirm
      for (const d of detected) expect(e.chips.some((ch) => ch.id === d)).toBe(false);

      // what the intake does after the responder taps each chip
      e.chips.push(...detection.symptoms.map((s) => ({ id: s.id, text: s.text, confidence: s.confidence, status: "confirmed" as const })));
      const r = evaluate(rulesDoc, icd10, toEncounterInput(questionnaires, e));
      expect(r.urgency).toBe(c.expected.urgency);
      const fired = r.fired.map((f) => f.id);
      for (const f of c.expected.must_fire) expect(fired).toContain(f);
    });
  }
});
