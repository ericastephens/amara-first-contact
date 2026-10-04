// One-time device setup chosen on the landing page: where the app is used, by whom, and in which languages.
// Saved on the device so it works offline; changed later from Settings. Nothing here is patient data.
import { adminAreas, locales } from "../data";
import type { Country, Language } from "../data/schemas";
import { hasUi, uiLanguages, withEffectiveSupport } from "../languages/packs";

export interface Setup {
  country: string; // ISO code from data/locales.json
  region: string;
  district: string;
  role: string;
  /** The professional's own name (optional) and work ID (required): licence, registration or staff number.
   *  Stamped on every referral note and escalation approval so the clinic knows who referred. */
  workerName?: string;
  workId: string;
  /** Where the first responder works: GPS fix or the typed place found on the map. Clinics are ranked from here. */
  location?: { lat: number; lon: number; method: "gps" | "place" | "sample"; label: string; accuracyM?: number };
  staffLang: string;
  /** Languages offered to patients at intake, in the order chosen. Custom ones have support "keypad_audio". */
  patientLangs: Language[];
  savedAt: string;
}

const KEY = "amara.setup";
type Listener = () => void;
const listeners = new Set<Listener>();
let cache: Setup | null | undefined;

export function getSetup(): Setup | null {
  if (cache !== undefined) return cache;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Setup) : null;
  } catch {
    cache = null;
  }
  return cache;
}

export function saveSetup(s: Setup): void {
  cache = s;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: setup lasts for this session only
  }
  listeners.forEach((l) => l());
}

export function clearSetup(): void {
  cache = null;
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function onSetupChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function countryByIso(iso: string): Country | undefined {
  return locales.countries.find((c) => c.iso === iso);
}

/** Languages the app interface can be used in for this country: its staff languages plus any local
 *  language that has gained a UI pack (src/i18n/<code>.json), e.g. Twi in Ghana once translated. */
export function staffLanguages(c: Country): Language[] {
  const out = c.staff.map(withEffectiveSupport);
  for (const l of c.patient_local) if (hasUi(l.code) && !out.some((x) => x.code === l.code)) out.push(withEffectiveSupport(l));
  return out;
}

/** Staff + local languages of a country, without duplicates (staff first), with support levels
 *  upgraded by any language pack that has been added. */
export function countryLanguages(c: Country): Language[] {
  const seen = new Map<string, Language>();
  for (const l of [...staffLanguages(c), ...c.patient_local.map(withEffectiveSupport)]) if (!seen.has(l.code)) seen.set(l.code, l);
  return [...seen.values()];
}

/** Interface languages offered by the language button: the staff language, the country's other
 *  staff/UI languages, then English. Before setup: every language that has a UI pack. */
export function uiLanguageChoices(s: Setup | null = getSetup()): string[] {
  const c = s ? countryByIso(s.country) : undefined;
  const list = c && s ? [s.staffLang, ...staffLanguages(c).map((l) => l.code), "en"] : uiLanguages();
  return [...new Set(list.filter(hasUi))];
}

export function nextUiLanguage(current: string, s: Setup | null = getSetup()): string {
  const choices = uiLanguageChoices(s);
  return choices[(choices.indexOf(current) + 1) % choices.length] ?? "en";
}

// ---- places: select-only regions and districts

export interface RegionOption {
  name: string;
  /** Empty when the country has no district list (Tanzania: district typed, region from locales.json). */
  districts: string[];
}

/** Region (and district) lists for a country. Outside Tanzania they come from data/admin_areas.json
 *  (geoBoundaries) and both are select-only; Tanzania uses its curated region list in locales.json. */
export function regionOptions(c: Country): RegionOption[] {
  const areas = adminAreas.countries[c.iso];
  if (areas) return areas.regions.map((r) => ({ name: r.name, districts: r.districts }));
  return c.regions.map((name) => ({ name, districts: [] }));
}

/** True when the district must be chosen from a list (every country with data/admin_areas.json entries). */
export function districtIsSelectOnly(c: Country): boolean {
  return Boolean(adminAreas.countries[c.iso]);
}

export function districtOptions(c: Country, region: string | undefined): string[] {
  return regionOptions(c).find((r) => r.name === region)?.districts ?? [];
}

/** Region chosen from the list; district chosen from the region's list where the country has one. */
export function validPlace(c: Country, region: string | undefined, district: string | undefined): boolean {
  const regions = regionOptions(c);
  if (regions.length > 0 && !regions.some((r) => r.name === region)) return false;
  if (districtIsSelectOnly(c) && !districtOptions(c, region).includes(district ?? "")) return false;
  return true;
}

/** Default patient languages for a country: its staff default plus every fully supported staff language. */
export function defaultPatientLangs(c: Country): Language[] {
  const all = staffLanguages(c);
  const staff = all.find((l) => l.code === c.staff_default) ?? all[0];
  const full = all.filter((l) => l.support === "full");
  const out: Language[] = [];
  for (const l of [staff, ...full]) if (!out.some((x) => x.code === l.code)) out.push(l);
  return out;
}

/** Work ID: 3 to 30 letters, digits, spaces, dots, dashes or slashes (e.g. ADDO-KLM-0421, TNMC/12345). */
export function validWorkId(id: string | undefined): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 ./-]{2,29}$/.test((id ?? "").trim());
}

/** "Site · Name · Work ID ..." for notes and records. */
export function responderLabel(site: string, s: Setup | null = getSetup()): string {
  if (!s) return site;
  return [site, s.workerName?.trim(), `Work ID ${s.workId.trim()}`].filter(Boolean).join(" · ");
}

/** A setup is valid when the country exists, the region (and outside Tanzania the district) is chosen from the lists,
 *  a role is set, the staff language is one of the country's staff languages (never a keypad-only one)
 *  and at least one patient language is chosen. */
export function validSetup(s: Partial<Setup>): s is Setup {
  const c = s.country ? countryByIso(s.country) : undefined;
  if (!c) return false;
  if (!validPlace(c, s.region, s.district)) return false;
  if (!s.role) return false;
  if (!validWorkId(s.workId)) return false;
  const staff = staffLanguages(c).find((l) => l.code === s.staffLang);
  if (!staff || staff.support === "keypad_audio") return false;
  return (s.patientLangs?.length ?? 0) > 0;
}

/** The quick demo setup used in the video: Tanzania, Kilimanjaro, drug shop, Swahili. */
export function demoSetup(now: string): Setup {
  const c = countryByIso("TZ")!;
  const langs = countryLanguages(c);
  const pick = (code: string) => langs.find((l) => l.code === code)!;
  return {
    country: "TZ",
    region: "Kilimanjaro",
    district: "Hai",
    role: "drug_shop",
    workerName: "Rehema (sample)",
    workId: "ADDO-KLM-0421",
    staffLang: "sw",
    patientLangs: [pick("sw"), pick("en"), pick("chagga")],
    savedAt: now,
  };
}

/** Language a patient chose at intake, looked up in the setup (falls back to the country list). */
export function patientLanguage(code: string | undefined): Language | undefined {
  if (!code) return undefined;
  const s = getSetup();
  const fromSetup = s?.patientLangs.find((l) => l.code === code);
  if (fromSetup) return fromSetup;
  for (const c of locales.countries) {
    const l = countryLanguages(c).find((x) => x.code === code);
    if (l) return l;
  }
  return undefined;
}
