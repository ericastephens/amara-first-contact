// Structured SOAP-style note for the clinician. Plain text, written on the device.
// Everything clinical in it comes from the encounter answers and data/rules.json (with sources).
import type { IntentLabelsDoc, Question, Questionnaires, Urgency } from "../data/schemas";
import { optionLabelIn, translate, type Lang } from "../i18n/translate";
import { questionForGroup, symptomIds, visibleUnanswered, type Encounter } from "./encounter";
import type { FlagDecision, RulesResult } from "./rules";
import { localDateTime } from "./time";

export interface NoteContext {
  questionnaires: Questionnaires;
  labels: IntentLabelsDoc;
  urgencyLabel: string;
  referral?: { clinic: string; date?: string; time?: string; code: string; provisional: boolean };
  responder: string;
  /** Staff language for question text and answer labels (default English). */
  lang?: Lang;
  /** Whether a BP cuff is available (decides if a missing BP reading is worth listing). Default true. */
  hasBpCuff?: boolean;
}

/** Urgencies that lead to a referral once the responder confirms the flags. */
const REFERRING: Urgency[] = ["go_now", "refer_today", "refer_routine", "ask_clinic"];

const UNIT_KEY: Record<string, string> = { days: "intake.days", weeks: "intake.weeks", months: "intake.months" };

const GROUP_EN: Record<string, string> = {
  pregnant: "Pregnant",
  postpartum: "Postpartum (gave birth in the last 6 weeks)",
  stillbirth: "After a stillbirth or loss",
  child: "Child (under 18)",
  adult_other: "Mother herself (other)",
};

/** An answer as staff read it: option labels and Yes/No in the staff language, never raw ids. */
export function answerText(question: Question, value: string, lang: Lang): string {
  if (question.type === "yes_no") {
    const key = `ans.${value}`;
    const s = translate(lang, key);
    return s === key ? value : s;
  }
  if (question.type === "choice") return optionLabelIn(lang, question.id, value);
  if (question.type === "number" && question.unit) return `${value} ${translate(lang, UNIT_KEY[question.unit] ?? question.unit)}`;
  return value;
}

export function buildNote(enc: Encounter, result: RulesResult, decisions: FlagDecision[], ctx: NoteContext): string {
  const { questionnaires: q, labels } = ctx;
  const lang = ctx.lang ?? "en";
  const question = (id: string) => questionForGroup(q, id, enc.group);
  const label = (id: string) => labels.labels.find((l) => l.id === id)?.en ?? id;
  const lines: string[] = [];
  lines.push(`AMARA REFERRAL NOTE  ·  ${localDateTime(enc.createdAt)}`);
  lines.push(`Patient: ${enc.patientName || "(name not given)"}  ·  ${GROUP_EN[enc.group]}`);
  if (enc.answers.q_gest_weeks) lines.push(`Gestation: ${enc.answers.q_gest_weeks} weeks`);
  if (enc.answers.q_days_pp) lines.push(`Days since birth: ${enc.answers.q_days_pp}`);
  if (enc.answers.q_child_age_months) lines.push(`Child age: ${enc.answers.q_child_age_months} months`);
  lines.push(`Seen by: ${ctx.responder}`);
  lines.push("");

  lines.push("S — SUBJECTIVE");
  if (enc.answers.q_complaint) {
    lines.push(`  In her words: "${enc.answers.q_complaint}"`);
    const confirmed = enc.chips.filter((c) => c.status === "confirmed").map((c) => label(c.id));
    lines.push(
      `  Understood as (intent model, confirmed by responder): ${confirmed.length ? confirmed.join("; ") : "none"}`,
    );
    const open = enc.uncertainChips.filter((c) => c.status === "open");
    if (open.length) lines.push(`  Not sure (ask her again): ${open.map((c) => `"${c.text}"`).join("; ")}`);
  }
  if (enc.answers.q_meds_bought) lines.push(`  Medicines already taken: ${enc.answers.q_meds_bought}`);
  lines.push("  Answers:");
  for (const [qid, value] of Object.entries(enc.answers)) {
    const qq = question(qid);
    if (!qq || qq.type === "free_text") continue;
    lines.push(`   - ${qq[lang]} ${answerText(qq, value, lang)}`);
  }
  lines.push("");

  lines.push("O — OBJECTIVE");
  lines.push(enc.bp ? `  Blood pressure: ${enc.bp.sys}/${enc.bp.dia} mmHg` : "  Blood pressure: not measured");
  const exposures = symptomIds(q, enc).filter((s) => s.startsWith("exposure_"));
  lines.push(`  Exposures: ${exposures.length ? exposures.map(label).join("; ") : "none reported"}`);
  lines.push(`  Symptoms recorded: ${symptomIds(q, enc).filter((s) => !s.startsWith("exposure_")).map(label).join("; ") || "none"}`);
  lines.push("");

  lines.push("A — ASSESSMENT (rules from data/rules.json, not a diagnosis)");
  lines.push(`  Urgency: ${ctx.urgencyLabel}`);
  for (const f of result.fired) {
    const d = decisions.find((x) => x.ruleId === f.id);
    const status = d?.decision === "override" ? `OVERRIDDEN by responder: ${d.reason}` : "confirmed by responder";
    lines.push(`  - ${f.reason.en} [${f.sourceTitle}${f.section ? `, ${f.section}` : ""}] (${status})`);
  }
  if (result.fired.length === 0) lines.push("  - No rule matched.");
  if (result.ruleOut.length) {
    lines.push("  Conditions to rule out — Draft — clinician to confirm:");
    for (const r of result.ruleOut) lines.push(`   - ${r.code} ${r.title} (Draft — clinician to confirm)`);
  }
  const unanswered = visibleUnanswered(q, enc, result.unanswered, { has_bp_cuff: ctx.hasBpCuff ?? true });
  if (unanswered.length) {
    lines.push(
      `  Unanswered questions that could change this: ${unanswered
        .map((id) => (id === "q_bp" ? "Blood pressure reading" : question(id)?.[lang] ?? id))
        .join("; ")}`,
    );
  }
  lines.push("");

  lines.push("P — PLAN");
  if (ctx.referral) {
    const ref = ctx.referral;
    const slot =
      result.urgency === "go_now"
        ? "go now (no appointment needed)"
        : ref.date
          ? `slot ${ref.date} ${ref.time}${ref.provisional ? " (provisional until sync)" : ""}`
          : "no free slot, clinic to confirm a time";
    lines.push(`  Referred to ${ref.clinic}, ${slot}. Code ${ref.code}.`);
  } else if (REFERRING.includes(result.urgency)) {
    lines.push(`  Referral pending responder confirmation (urgency: ${ctx.urgencyLabel}).`);
  } else {
    lines.push("  No referral. Follow up if anything changes.");
  }
  const consentQ = question("q_consent");
  const consent = enc.answers.q_consent;
  lines.push(`  Consent to share referral and send SMS/calls: ${consent && consentQ ? answerText(consentQ, consent, lang) : "not asked"}`);
  return lines.join("\n");
}
