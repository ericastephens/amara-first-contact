// Encounter model used by the app, and conversion to the rules-engine input.
import type { EncounterInput, Group, Question, Questionnaires } from "../data/schemas";

export interface Chip {
  id: string;
  text: string;
  confidence: number;
  status: "suggested" | "confirmed" | "removed";
}

export interface UncertainChip {
  text: string;
  best: string;
  confidence: number;
  status: "open" | "dismissed";
}

export interface Encounter {
  id: string;
  createdAt: string;
  updatedAt: string;
  group: Group;
  patientName: string;
  phone: string;
  /** Raw answers by question id: "yes" | "no" | "dont_know" | option id | number as string | free text. */
  answers: Record<string, string>;
  /** When each question was answered (ISO timestamps). */
  answeredAt: Record<string, string>;
  bp?: { sys: number; dia: number };
  chips: Chip[];
  uncertainChips: UncertainChip[];
  wardOfResidence: string;
  /** Set when the encounter comes from a scripted demo case. */
  demoCaseId?: string;
}

export const NUMERIC_FIELDS = ["gest_weeks", "days_postpartum", "child_age_months"] as const;

export function allQuestions(q: Questionnaires): Question[] {
  return [...q.modules.flatMap((m) => m.questions), ...q.optional];
}

export function questionById(q: Questionnaires, id: string): Question | undefined {
  return allQuestions(q).find((x) => x.id === id);
}

/**
 * The question as asked to this group. Some ids appear in more than one module (q_selfharm,
 * q_bp_ever_checked) with a different show_if; the module that applies to the group wins.
 */
export function questionForGroup(q: Questionnaires, id: string, group: Group): Question | undefined {
  for (const m of questionsForGroup(q, group)) {
    const found = m.questions.find((x) => x.id === id);
    if (found) return found;
  }
  return q.optional.find((x) => x.id === id);
}

/**
 * Unanswered questions worth listing: only those the intake would actually show this group
 * (e.g. q_selfharm only after its low-mood parent was answered "yes"). "q_bp" is the BP reading.
 */
export function visibleUnanswered(
  q: Questionnaires,
  enc: Pick<Encounter, "group" | "answers">,
  ids: string[],
  roles: { has_bp_cuff: boolean },
): string[] {
  return ids.filter((id) => {
    if (id === "q_bp") return roles.has_bp_cuff;
    const question = questionForGroup(q, id, enc.group);
    return question ? isVisible(question, enc, roles) : false;
  });
}

/** Questions for this group in display order (common, group module(s), social/environment). */
export function questionsForGroup(q: Questionnaires, group: Group): { moduleId: string; questions: Question[] }[] {
  return q.modules
    .filter((m) => m.applies_to.includes(group))
    .map((m) => ({
      moduleId: m.id,
      questions: m.questions.filter((qq) => !qq.applies_to || qq.applies_to.includes(group)),
    }));
}

/** show_if / show_if_min / show_if_role checks. */
export function isVisible(question: Question, enc: Pick<Encounter, "answers">, roles: { has_bp_cuff: boolean }): boolean {
  if (question.show_if) {
    for (const [k, v] of Object.entries(question.show_if)) if (enc.answers[k] !== v) return false;
  }
  if (question.show_if_min) {
    for (const [field, min] of Object.entries(question.show_if_min)) {
      const raw = numericAnswer(enc.answers, field);
      // unknown value: show the question (safer)
      if (raw !== undefined && raw < min) return false;
    }
  }
  if (question.show_if_role === "has_bp_cuff" && !roles.has_bp_cuff) return false;
  return true;
}

const FIELD_QUESTION: Record<string, string> = {
  gest_weeks: "q_gest_weeks",
  days_postpartum: "q_days_pp",
  child_age_months: "q_child_age_months",
};

function numericAnswer(answers: Record<string, string>, field: string): number | undefined {
  const raw = answers[FIELD_QUESTION[field]];
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Symptom ids: yes-answers to questions with maps_to, plus chips the responder confirmed. */
export function symptomIds(q: Questionnaires, enc: Encounter): string[] {
  const ids = new Set<string>();
  for (const question of questionsForGroup(q, enc.group).flatMap((m) => m.questions)) {
    if (question.maps_to && enc.answers[question.id] === "yes") ids.add(question.maps_to);
  }
  for (const c of enc.chips) if (c.status === "confirmed") ids.add(c.id);
  return [...ids];
}

export function toEncounterInput(q: Questionnaires, enc: Encounter): EncounterInput {
  const input: EncounterInput = {
    group: enc.group,
    symptoms: symptomIds(q, enc),
    answers: Object.fromEntries(
      Object.entries(enc.answers).filter(([k]) => questionById(q, k)?.type !== "free_text"),
    ),
    uncertain: enc.uncertainChips.some((c) => c.status === "open"),
    free_text: enc.answers.q_complaint,
  };
  for (const f of NUMERIC_FIELDS) {
    const n = numericAnswer(enc.answers, f);
    if (n !== undefined) input[f] = n;
  }
  // only a complete reading counts; a half-typed one is treated as "no reading"
  if (enc.bp && Number.isFinite(enc.bp.sys) && Number.isFinite(enc.bp.dia)) input.bp = enc.bp;
  return input;
}

export function newEncounter(group: Group, now: string, id: string): Encounter {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    group,
    patientName: "",
    phone: "",
    answers: {},
    answeredAt: {},
    chips: [],
    uncertainChips: [],
    wardOfResidence: "Ondera",
  };
}

/** Build an encounter from a golden test case (Demo mode). */
export function encounterFromCase(
  caseId: string,
  input: EncounterInput,
  now: string,
  id: string,
  name: string,
): Encounter {
  const enc = newEncounter(input.group, now, id);
  enc.demoCaseId = caseId;
  enc.patientName = name;
  enc.phone = "+255700000099";
  enc.answers = { ...input.answers, q_consent: "yes", q_language: "sw", q_reader: "reads_sms" };
  if (input.gest_weeks !== undefined) enc.answers.q_gest_weeks = String(input.gest_weeks);
  if (input.days_postpartum !== undefined) enc.answers.q_days_pp = String(input.days_postpartum);
  if (input.child_age_months !== undefined) enc.answers.q_child_age_months = String(input.child_age_months);
  if (input.free_text) enc.answers.q_complaint = input.free_text;
  enc.chips = input.symptoms.map((s) => ({ id: s, text: "", confidence: 1, status: "confirmed" }));
  if (input.uncertain) {
    enc.uncertainChips = [{ text: input.free_text ?? "…", best: "other", confidence: 0.2, status: "open" }];
  }
  if (input.bp) enc.bp = input.bp;
  for (const k of Object.keys(enc.answers)) enc.answeredAt[k] = now;
  return enc;
}

/**
 * Demo mode: start a scripted patient at the free-text step with her own sentence typed in.
 * The intent model reads the sentence in the intake (its chips still need the responder's confirmation),
 * so here `detected` (the labels the model finds in the sentence) are left out. Every other symptom of
 * the case is answered on the keypad question that maps to it (with its show_if parents), as a responder
 * would; a symptom with no such question falls back to a confirmed chip so the demo stays repeatable.
 */
export function demoEncounterFromCase(
  q: Questionnaires,
  caseId: string,
  input: EncounterInput,
  now: string,
  id: string,
  name: string,
  detected: string[],
): Encounter {
  const enc = encounterFromCase(caseId, { ...input, symptoms: [], uncertain: false }, now, id, name);
  const questions = questionsForGroup(q, input.group).flatMap((m) => m.questions);
  const answerYes = (question: Question) => {
    for (const [parent, value] of Object.entries(question.show_if ?? {})) {
      const pq = questions.find((x) => x.id === parent);
      if (pq && value === "yes") answerYes(pq);
      else enc.answers[parent] = value;
    }
    enc.answers[question.id] = "yes";
  };
  for (const s of input.symptoms) {
    if (detected.includes(s)) continue;
    const question = questions.find((x) => x.maps_to === s);
    if (question) answerYes(question);
    else enc.chips.push({ id: s, text: "", confidence: 1, status: "confirmed" });
  }
  for (const k of Object.keys(enc.answers)) enc.answeredAt[k] = now;
  return enc;
}
