// Three views of the same result. The Mother view is deliberately minimal: where to go, when, her code.
// No reason text, no "rule out" list and no ICD-10 code ever reaches it.
import type { RulesDoc, Urgency } from "../data/schemas";
import type { Lang, RulesResult } from "./rules";

export interface ReferralSummary {
  clinic: string;
  date?: string;
  time?: string;
  code: string;
  provisional: boolean;
}

export interface MotherView {
  urgencyLabel: string;
  goNow: boolean;
  clinic?: string;
  date?: string;
  time?: string;
  code?: string;
}

export interface ResponderView {
  urgency: Urgency;
  urgencyLabel: string;
  reasons: { ruleId: string; text: string; source: string; sourceUrl: string }[];
  unanswered: string[];
}

export interface ClinicianView extends ResponderView {
  /** Guideline sections can name conditions, so they are shown to the clinician only. */
  sections: Record<string, string | undefined>;
  ruleOut: { code: string; title: string; label: string }[];
}

export const DRAFT_LABEL = "Draft — clinician to confirm";

export function urgencyLabel(rulesDoc: RulesDoc, u: Urgency, lang: Lang): string {
  return rulesDoc.urgency_labels[u]?.[lang] ?? u;
}

export function motherView(rulesDoc: RulesDoc, result: RulesResult, referral: ReferralSummary | null, lang: Lang): MotherView {
  return {
    urgencyLabel: urgencyLabel(rulesDoc, result.urgency, lang),
    goNow: result.urgency === "go_now",
    clinic: referral?.clinic,
    date: referral?.date,
    time: referral?.time,
    code: referral?.code,
  };
}

export function responderView(rulesDoc: RulesDoc, result: RulesResult, lang: Lang): ResponderView {
  return {
    urgency: result.urgency,
    urgencyLabel: urgencyLabel(rulesDoc, result.urgency, lang),
    reasons: result.fired.map((f) => ({
      ruleId: f.id,
      text: f.reason[lang],
      source: f.sourceTitle,
      sourceUrl: f.sourceUrl,
    })),
    unanswered: result.unanswered,
  };
}

export function clinicianView(rulesDoc: RulesDoc, result: RulesResult, lang: Lang): ClinicianView {
  return {
    ...responderView(rulesDoc, result, lang),
    sections: Object.fromEntries(result.fired.map((f) => [f.id, f.section])),
    ruleOut: result.ruleOut.map((r) => ({ code: r.code, title: r.title, label: DRAFT_LABEL })),
  };
}
