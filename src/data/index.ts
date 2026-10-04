// Loads every file in data/ and validates it. The JSON is bundled into the app at build time,
// so it is precached by the service worker and available offline with no network call.
// Invalid data throws at start-up (fails loudly in dev and in tests).
import questionnairesJson from "../../data/questionnaires.json";
import rulesJson from "../../data/rules.json";
import icdJson from "../../data/icd10_draft.json";
import smsJson from "../../data/sms_templates.json";
import facilitiesJson from "../../data/facilities_sample.json";
import slotsJson from "../../data/slots_sample.json";
import labelsJson from "../../data/intent_labels.json";
import testCasesJson from "../../data/test_cases.json";
import localesJson from "../../data/locales.json";
import adminAreasJson from "../../data/admin_areas.json";
import outbreakCsv from "../../data/outbreak_counts_synthetic.csv?raw";
import {
  AdminAreasDoc,
  FacilitiesDoc,
  Icd10Doc,
  IntentLabelsDoc,
  LocalesDoc,
  Questionnaires,
  RulesDoc,
  SlotsDoc,
  SmsDoc,
  SmsPack,
  TestCasesDoc,
  parseOutbreakCsv,
} from "./schemas";
import type { z } from "zod";

function validate<T extends z.ZodTypeAny>(name: string, schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`data/${name} is invalid: ${result.error.message}`);
  }
  return result.data;
}

export const questionnaires = validate("questionnaires.json", Questionnaires, questionnairesJson);
export const rulesDoc = validate("rules.json", RulesDoc, rulesJson);
export const icd10 = validate("icd10_draft.json", Icd10Doc, icdJson);
export const smsDoc = mergeSmsPacks(
  validate("sms_templates.json", SmsDoc, smsJson),
  import.meta.glob("../../data/sms/*.json", { eager: true, import: "default" }),
);
export const facilitiesDoc = validate("facilities_sample.json", FacilitiesDoc, facilitiesJson);
export const slotsDoc = validate("slots_sample.json", SlotsDoc, slotsJson);
export const intentLabels = validate("intent_labels.json", IntentLabelsDoc, labelsJson);
export const testCases = validate("test_cases.json", TestCasesDoc, testCasesJson);
export const outbreakRows = parseOutbreakCsv(outbreakCsv);
export const locales = validate("locales.json", LocalesDoc, localesJson);
export const adminAreas = validate("admin_areas.json", AdminAreasDoc, adminAreasJson);

/** Message packs in data/sms/<code>.json are merged into smsDoc, so a new language needs no code change.
 *  Empty strings are "not translated yet" and are skipped (that message falls back to English). */
export function mergeSmsPacks(base: SmsDoc, packs: Record<string, unknown>): SmsDoc {
  const out: SmsDoc = {
    ...base,
    time_format: { sw: "swahili", en: "12h", ...base.time_format },
    digits: { ...base.digits },
    templates: Object.fromEntries(Object.entries(base.templates).map(([k, v]) => [k, { ...v }])),
    voice_scripts: Object.fromEntries(Object.entries(base.voice_scripts).map(([k, v]) => [k, { ...v }])),
    days: { ...base.days },
  };
  for (const [path, raw] of Object.entries(packs)) {
    const pack = validate(path.replace(/^.*data\//, ""), SmsPack, raw);
    for (const [id, text] of Object.entries(pack.templates)) {
      if (!text.trim()) continue;
      out.templates[id] = { ...(out.templates[id] ?? { en: "", sw: "" }), [pack.code]: text };
    }
    for (const [id, text] of Object.entries(pack.voice_scripts ?? {})) {
      if (!text.trim()) continue;
      out.voice_scripts[id] = { ...(out.voice_scripts[id] ?? { en: "", sw: "" }), [pack.code]: text };
    }
    if (pack.days.every((d) => d.trim())) out.days[pack.code] = pack.days;
    out.time_format![pack.code] = pack.time_format;
    if (pack.digits && Object.values(pack.digits).every((d) => d.trim())) out.digits![pack.code] = pack.digits;
  }
  return out;
}

/** Files that are entirely sample data: anything shown from these gets a "Sample data" badge. */
export const SYNTHETIC_FILES = {
  facilities: facilitiesDoc.synthetic === true,
  slots: slotsDoc.synthetic === true,
  outbreak: true, // outbreak_counts_synthetic.csv: name contains "synthetic"
  testCases: testCases.synthetic === true,
};

export const DEMO_TODAY = slotsDoc.demo_today;

export function labelFor(id: string) {
  return intentLabels.labels.find((l) => l.id === id);
}
