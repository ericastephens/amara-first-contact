import { z } from "zod";

export const Bilingual = z.object({ en: z.string().min(1), sw: z.string().min(1) });
export type Bilingual = z.infer<typeof Bilingual>;

export const Urgency = z.enum(["go_now", "refer_today", "ask_clinic", "refer_routine", "home_care_followup"]);
export type Urgency = z.infer<typeof Urgency>;

export const Group = z.enum(["pregnant", "postpartum", "stillbirth", "child", "adult_other"]);
export type Group = z.infer<typeof Group>;

export const FacilityLevel = z.enum(["drug_shop", "dispensary", "health_centre", "hospital"]);
export type FacilityLevel = z.infer<typeof FacilityLevel>;

// ---- questionnaires.json
export const Question = z.object({
  id: z.string(),
  type: z.enum(["free_text", "yes_no", "number", "choice", "bp"]),
  en: z.string(),
  sw: z.string(),
  maps_to: z.string().optional(),
  unit: z.string().optional(),
  field: z.enum(["gest_weeks", "days_postpartum", "child_age_months"]).optional(),
  show_if: z.record(z.string(), z.string()).optional(),
  show_if_min: z.record(z.string(), z.number()).optional(),
  show_if_role: z.string().optional(),
  applies_to: z.array(Group).optional(),
  options: z.array(z.string()).optional(),
  sensitive: z.boolean().optional(),
  required: z.boolean().optional(),
  ai: z.string().optional(),
});
export type Question = z.infer<typeof Question>;

export const Questionnaires = z.object({
  description: z.string(),
  review: z.string(),
  groups: z.array(z.object({ id: Group, en: z.string(), sw: z.string() })),
  modules: z.array(
    z.object({
      id: z.string(),
      applies_to: z.array(Group),
      source: z.string().optional(),
      note: z.string().optional(),
      questions: z.array(Question),
    }),
  ),
  optional: z.array(Question),
});
export type Questionnaires = z.infer<typeof Questionnaires>;

// ---- rules.json
export const Rule = z.object({
  id: z.string(),
  groups: z.array(Group).min(1),
  when: z.object({
    all: z.array(z.string()).optional(),
    any: z.array(z.string()).optional(),
    answers: z.record(z.string(), z.string()).optional(),
    min_gest_weeks: z.number().optional(),
    days_postpartum_max: z.number().optional(),
    child_age_months_lt: z.number().optional(),
    bp: z.object({ sys_gte: z.number(), dia_gte: z.number() }).optional(),
  }),
  urgency: Urgency,
  facility_level: FacilityLevel,
  reason: Bilingual,
  rule_out: z.array(z.string()),
  source: z.string().min(1),
  section: z.string().optional(),
  syndrome: z.string().optional(),
});
export type Rule = z.infer<typeof Rule>;

export const OutbreakSyndrome = z.object({
  id: z.string(),
  en: z.string(),
  sw: z.string(),
  immediately_notifiable: z.boolean(),
  guidance: Bilingual,
  source: z.string(),
});
export type OutbreakSyndrome = z.infer<typeof OutbreakSyndrome>;

export const RulesDoc = z.object({
  version: z.string(),
  review: z.string(),
  semantics: z.string(),
  urgency_order: z.array(Urgency),
  urgency_labels: z.record(Urgency, Bilingual),
  sources: z.record(z.string(), z.object({ title: z.string(), url: z.string().url() })),
  rules: z.array(Rule),
  outbreak: z.object({
    method: z.string(),
    min_count: z.number(),
    sd_multiplier: z.number(),
    baseline_weeks: z.number().int().positive(),
    share_radius_km: z.number(),
    notifiable_note: z.string().optional(),
    syndromes: z.array(OutbreakSyndrome),
  }),
});
export type RulesDoc = z.infer<typeof RulesDoc>;

// ---- icd10_draft.json
export const Icd10Doc = z.object({
  description: z.string(),
  verified: z.boolean(),
  verify_url: z.string(),
  codes: z.array(z.object({ code: z.string(), title: z.string() })),
});
export type Icd10Doc = z.infer<typeof Icd10Doc>;

// ---- intent_labels.json
export const IntentLabelsDoc = z.object({
  description: z.string(),
  review: z.string(),
  labels: z.array(z.object({ id: z.string(), en: z.string(), sw: z.string() })),
});
export type IntentLabelsDoc = z.infer<typeof IntentLabelsDoc>;

// ---- sms_templates.json
const LangPair = z.object({ sw: z.string(), en: z.string() });
export const SmsDoc = z.object({
  description: z.string(),
  review: z.string(),
  templates: z.record(z.string(), LangPair),
  voice_scripts: z.record(z.string(), LangPair),
  days: z.object({ sw: z.array(z.string()).length(7), en: z.array(z.string()).length(7) }),
});
export type SmsDoc = z.infer<typeof SmsDoc>;

// ---- facilities_sample.json
export const Facility = z.object({
  id: z.string(),
  name: z.string(),
  name_en: z.string().optional(),
  level: FacilityLevel,
  lat: z.number(),
  lon: z.number(),
  ward: z.string(),
  has_bp_cuff: z.boolean().optional(),
  has_malaria_rdt: z.boolean().optional(),
  has_lab: z.boolean().optional(),
  phone_sms: z.string().optional(),
  synthetic: z.boolean().optional(),
});
export type Facility = z.infer<typeof Facility>;

export const FacilitiesDoc = z.object({
  synthetic: z.boolean().optional(),
  description: z.string(),
  level_order: z.array(FacilityLevel),
  responder_sites: z.array(
    z.object({ id: z.string(), name: z.string(), type: z.string(), lat: z.number(), lon: z.number(), ward: z.string() }),
  ),
  facilities: z.array(Facility).min(1),
});
export type FacilitiesDoc = z.infer<typeof FacilitiesDoc>;

// ---- slots_sample.json
export const Slot = z.object({
  facility_id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(["free", "taken"]),
});
export type Slot = z.infer<typeof Slot>;

export const SlotsDoc = z.object({
  synthetic: z.boolean().optional(),
  description: z.string(),
  demo_today: z.string(),
  slots: z.array(Slot),
});
export type SlotsDoc = z.infer<typeof SlotsDoc>;

// ---- test_cases.json
export const Encounter = z.object({
  group: Group,
  symptoms: z.array(z.string()),
  answers: z.record(z.string(), z.string()),
  gest_weeks: z.number().optional(),
  days_postpartum: z.number().optional(),
  child_age_months: z.number().optional(),
  bp: z.object({ sys: z.number(), dia: z.number() }).optional(),
  uncertain: z.boolean().optional(),
  free_text: z.string().optional(),
});
export type EncounterInput = z.infer<typeof Encounter>;

export const TestCasesDoc = z.object({
  synthetic: z.boolean().optional(),
  cases: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      encounter: Encounter,
      expected: z.object({
        urgency: Urgency,
        must_fire: z.array(z.string()),
        rule_out_includes: z.array(z.string()),
      }),
    }),
  ),
});
export type TestCasesDoc = z.infer<typeof TestCasesDoc>;

// ---- outbreak_counts_synthetic.csv
export const OutbreakRow = z.object({
  iso_year: z.number().int(),
  iso_week: z.number().int().min(1).max(53),
  ward: z.string(),
  syndrome: z.string(),
  count: z.number().int().min(0),
  reporting_sites: z.number().int().min(0),
  synthetic: z.boolean(),
});
export type OutbreakRow = z.infer<typeof OutbreakRow>;

export function parseOutbreakCsv(text: string): OutbreakRow[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    const rec: Record<string, string> = {};
    cols.forEach((c, i) => (rec[c] = cells[i]));
    return OutbreakRow.parse({
      iso_year: Number(rec.iso_year),
      iso_week: Number(rec.iso_week),
      ward: rec.ward,
      syndrome: rec.syndrome,
      count: Number(rec.count),
      reporting_sites: Number(rec.reporting_sites),
      synthetic: rec.synthetic === "true",
    });
  });
}
