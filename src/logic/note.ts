// Structured SOAP-style note for the clinician. Plain text, written on the device.
// Everything clinical in it comes from the encounter answers and data/rules.json (with sources).
import type { IntentLabelsDoc, Questionnaires } from "../data/schemas";
import { questionById, symptomIds, type Encounter } from "./encounter";
import type { FlagDecision, RulesResult } from "./rules";

export interface NoteContext {
  questionnaires: Questionnaires;
  labels: IntentLabelsDoc;
  urgencyLabel: string;
  referral?: { clinic: string; date?: string; time?: string; code: string; provisional: boolean };
  responder: string;
}

const GROUP_EN: Record<string, string> = {
  pregnant: "Pregnant",
  postpartum: "Postpartum (gave birth in the last 6 weeks)",
  stillbirth: "After a stillbirth or loss",
  child: "Child (under 18)",
  adult_other: "Mother herself (other)",
};

function answerText(value: string): string {
  return value.replace(/_/g, " ");
}

export function buildNote(enc: Encounter, result: RulesResult, decisions: FlagDecision[], ctx: NoteContext): string {
  const { questionnaires: q, labels } = ctx;
  const label = (id: string) => labels.labels.find((l) => l.id === id)?.en ?? id;
  const lines: string[] = [];
  lines.push(`AMARA REFERRAL NOTE  ·  ${enc.createdAt.slice(0, 16).replace("T", " ")}`);
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
    const question = questionById(q, qid);
    if (!question || question.type === "free_text") continue;
    lines.push(`   - ${question.en} ${answerText(value)}`);
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
  if (result.unanswered.length) {
    lines.push(
      `  Unanswered questions that could change this: ${result.unanswered
        .map((id) => (id === "q_bp" ? "Blood pressure reading" : questionById(q, id)?.en ?? id))
        .join("; ")}`,
    );
  }
  lines.push("");

  lines.push("P — PLAN");
  if (ctx.referral) {
    const when = ctx.referral.date ? `${ctx.referral.date} ${ctx.referral.time}` : "now";
    lines.push(
      `  Referred to ${ctx.referral.clinic}, ${when}${ctx.referral.provisional ? " (provisional until sync)" : ""}. Code ${ctx.referral.code}.`,
    );
  } else {
    lines.push("  No referral. Follow up if anything changes.");
  }
  lines.push(`  Consent to share referral and send SMS/calls: ${enc.answers.q_consent ?? "not asked"}`);
  return lines.join("\n");
}
