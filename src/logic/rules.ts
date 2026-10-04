// Rules engine: evaluates data/rules.json against an encounter, following the "semantics" field in
// rules.json and behaving exactly like the reference engine in scripts/check_data.py.
// The intent model never decides urgency; only these rules do.
import type { Bilingual, EncounterInput, FacilityLevel, Icd10Doc, Rule, RulesDoc, Urgency } from "../data/schemas";

export type { Lang } from "./lang";

export interface FiredRule {
  id: string;
  urgency: Urgency;
  facilityLevel: FacilityLevel;
  reason: Bilingual;
  source: string;
  sourceTitle: string;
  sourceUrl: string;
  section?: string;
  syndrome?: string;
  ruleOut: string[];
}

export interface RuleOut {
  code: string;
  title: string;
  /** Always true until a clinician confirms the code. */
  draft: true;
}

export interface RulesResult {
  urgency: Urgency;
  fired: FiredRule[];
  ruleOut: RuleOut[];
  /** Question ids whose answer is missing and could change the result. */
  unanswered: string[];
  /** Minimum facility level for the referral (highest level any fired rule asks for). */
  facilityLevel: FacilityLevel | null;
}

const NUMERIC = [
  { cond: "min_gest_weeks", field: "gest_weeks", question: "q_gest_weeks", ok: (limit: number, v: number) => v >= limit },
  { cond: "days_postpartum_max", field: "days_postpartum", question: "q_days_pp", ok: (limit: number, v: number) => v <= limit },
  { cond: "child_age_months_lt", field: "child_age_months", question: "q_child_age_months", ok: (limit: number, v: number) => v < limit },
] as const;

const LEVELS: FacilityLevel[] = ["drug_shop", "dispensary", "health_centre", "hospital"];

export interface FireCheck {
  fires: boolean;
  /** Numeric fields that were missing and counted as meeting the condition. */
  missingNumeric: string[];
}

export function ruleFires(rule: Rule, enc: EncounterInput): FireCheck {
  const no = { fires: false, missingNumeric: [] };
  const w = rule.when;
  const syms = new Set(enc.symptoms);
  if (!rule.groups.includes(enc.group)) return no;
  if (!(w.all ?? []).every((s) => syms.has(s))) return no;
  if (w.any && w.any.length > 0 && !w.any.some((s) => syms.has(s))) return no;
  for (const [k, v] of Object.entries(w.answers ?? {})) {
    if (enc.answers[k] !== v) return no;
  }
  const missingNumeric: string[] = [];
  for (const n of NUMERIC) {
    const limit = w[n.cond];
    if (limit === undefined) continue;
    const value = enc[n.field];
    if (value === undefined || value === null) {
      missingNumeric.push(n.question); // missing counts as meeting the condition (safer to refer)
    } else if (!n.ok(limit, value)) {
      return no;
    }
  }
  if (w.bp) {
    const bp = enc.bp;
    if (!bp) return no;
    if (!(bp.sys >= w.bp.sys_gte || bp.dia >= w.bp.dia_gte)) return no;
  }
  return { fires: true, missingNumeric };
}

/** Would this rule fire if the missing answer / BP were given? Used to list questions that change the result. */
function missingInputsThatMatter(rule: Rule, enc: EncounterInput): string[] {
  const out: string[] = [];
  const w = rule.when;
  const missingAnswers = Object.entries(w.answers ?? {}).filter(([k]) => enc.answers[k] === undefined);
  const bpMissing = Boolean(w.bp) && !enc.bp;
  if (missingAnswers.length === 0 && !bpMissing) return out;
  const filled: EncounterInput = {
    ...enc,
    answers: { ...enc.answers, ...Object.fromEntries(missingAnswers) },
    bp: bpMissing && w.bp ? { sys: w.bp.sys_gte, dia: w.bp.dia_gte } : enc.bp,
  };
  if (ruleFires(rule, filled).fires) {
    out.push(...missingAnswers.map(([k]) => k));
    if (bpMissing) out.push("q_bp");
  }
  return out;
}

export function urgencyRank(rulesDoc: RulesDoc, u: Urgency): number {
  return rulesDoc.urgency_order.indexOf(u);
}

function highestUrgency(rulesDoc: RulesDoc, urgencies: Urgency[]): Urgency {
  return urgencies.reduce((best, u) => (urgencyRank(rulesDoc, u) < urgencyRank(rulesDoc, best) ? u : best));
}

export function toFiredRule(rulesDoc: RulesDoc, rule: Rule): FiredRule {
  const src = rulesDoc.sources[rule.source];
  return {
    id: rule.id,
    urgency: rule.urgency,
    facilityLevel: rule.facility_level,
    reason: rule.reason,
    source: rule.source,
    sourceTitle: src?.title ?? rule.source,
    sourceUrl: src?.url ?? "",
    section: rule.section,
    syndrome: rule.syndrome,
    ruleOut: rule.rule_out,
  };
}

/** Combine a set of fired rules into a result (also used after the responder overrides flags). */
export function summarise(
  rulesDoc: RulesDoc,
  icd: Icd10Doc,
  fired: FiredRule[],
  uncertain: boolean,
  unanswered: string[] = [],
): RulesResult {
  let urgency: Urgency;
  if (fired.length > 0) urgency = highestUrgency(rulesDoc, fired.map((f) => f.urgency));
  else if (uncertain) urgency = "ask_clinic";
  else urgency = "home_care_followup";

  const codes: string[] = [];
  for (const f of fired) for (const c of f.ruleOut) if (!codes.includes(c)) codes.push(c);
  const ruleOut: RuleOut[] = codes.map((code) => ({
    code,
    title: icd.codes.find((c) => c.code === code)?.title ?? code,
    draft: true,
  }));

  let facilityLevel: FacilityLevel | null = null;
  if (fired.length > 0) {
    facilityLevel = fired.reduce<FacilityLevel>(
      (lvl, f) => (LEVELS.indexOf(f.facilityLevel) > LEVELS.indexOf(lvl) ? f.facilityLevel : lvl),
      "drug_shop",
    );
  } else if (urgency === "ask_clinic") {
    facilityLevel = "dispensary";
  }
  return { urgency, fired, ruleOut, unanswered, facilityLevel };
}

export function evaluate(rulesDoc: RulesDoc, icd: Icd10Doc, enc: EncounterInput): RulesResult {
  const fired: FiredRule[] = [];
  const unanswered: string[] = [];
  const add = (q: string) => {
    if (!unanswered.includes(q)) unanswered.push(q);
  };
  for (const rule of rulesDoc.rules) {
    const check = ruleFires(rule, enc);
    if (check.fires) {
      fired.push(toFiredRule(rulesDoc, rule));
      check.missingNumeric.forEach(add);
    } else {
      missingInputsThatMatter(rule, enc).forEach(add);
    }
  }
  return summarise(rulesDoc, icd, fired, Boolean(enc.uncertain), unanswered);
}

export interface FlagDecision {
  ruleId: string;
  decision: "confirm" | "override";
  reason?: string;
}

/** Responder decisions: overridden flags (each with a required reason) are removed; urgency is recomputed. */
export function applyDecisions(
  rulesDoc: RulesDoc,
  icd: Icd10Doc,
  result: RulesResult,
  decisions: FlagDecision[],
  uncertain: boolean,
): RulesResult {
  for (const d of decisions) {
    if (d.decision === "override" && !d.reason?.trim()) {
      throw new Error(`Override of ${d.ruleId} needs a reason`);
    }
  }
  const overridden = new Set(decisions.filter((d) => d.decision === "override").map((d) => d.ruleId));
  const kept = result.fired.filter((f) => !overridden.has(f.id));
  return summarise(rulesDoc, icd, kept, uncertain, result.unanswered);
}

export function allFlagsDecided(result: RulesResult, decisions: FlagDecision[]): boolean {
  return result.fired.every((f) =>
    decisions.some((d) => d.ruleId === f.id && (d.decision === "confirm" || Boolean(d.reason?.trim()))),
  );
}
