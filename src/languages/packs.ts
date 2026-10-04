// Language packs. Adding a language needs no code change:
//   src/i18n/<code>.json   app interface strings (same keys as en.json; empty = not translated yet)
//   data/sms/<code>.json   SMS + voice texts for the mother (see docs/ADDING_A_LANGUAGE.md)
// Both are picked up automatically at build time and precached for offline use.
import type { Language, Support } from "../data/schemas";
import { smsDoc } from "../data";

const uiModules = import.meta.glob<Record<string, string>>("../i18n/*.json", { eager: true, import: "default" });

/** UI strings per language code, without "_meta"-style keys and without empty (untranslated) values. */
export const UI_PACKS: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(uiModules).map(([path, strings]) => {
    const code = path.split("/").pop()!.replace(/\.json$/, "");
    const clean = Object.fromEntries(
      Object.entries(strings).filter(([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim() !== ""),
    );
    return [code, clean];
  }),
);

/** Native name of each UI language, from the "_native" key of its file ("Kiswahili", "Twi"...). */
export const UI_NATIVE: Record<string, string> = Object.fromEntries(
  Object.entries(uiModules).map(([path, strings]) => {
    const code = path.split("/").pop()!.replace(/\.json$/, "");
    return [code, strings._native?.trim() || code];
  }),
);

const EN_KEYS = Object.keys(UI_PACKS.en ?? {});

/** Share of the English interface strings translated into this language (0..1). */
export function uiCoverage(code: string): number {
  const pack = UI_PACKS[code];
  if (!pack || EN_KEYS.length === 0) return 0;
  return EN_KEYS.filter((k) => k in pack).length / EN_KEYS.length;
}

/** The interface can be shown in this language (at least partly; missing strings show English). */
export function hasUi(code: string): boolean {
  return code === "en" || uiCoverage(code) > 0;
}

/** All interface languages that have any translation, English last. */
export function uiLanguages(): string[] {
  return [...Object.keys(UI_PACKS).filter((c) => c !== "en" && hasUi(c)).sort(), "en"];
}

/** Messages for the mother exist in this language (the referral SMS at minimum). */
export function hasSms(code: string): boolean {
  return Boolean(smsDoc.templates.referral?.[code]?.trim());
}

/** Support level shown in setup, upgraded automatically when a language pack is added. */
export function effectiveSupport(l: Language): Support {
  const cov = uiCoverage(l.code);
  if (cov >= 0.95 && hasSms(l.code)) return "full";
  if (cov > 0 || hasSms(l.code)) return l.support === "full" ? "full" : "ui_pending";
  return l.support;
}

export function withEffectiveSupport(l: Language): Language {
  return { ...l, support: effectiveSupport(l) };
}
