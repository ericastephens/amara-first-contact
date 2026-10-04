// Plain (non-React) string lookup, so logic modules such as the note can use the same labels as the UI.
import en from "./en.json";
import sw from "./sw.json";

export type Lang = "sw" | "en";
const STRINGS: Record<Lang, Record<string, string>> = { en, sw };

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Label for a choice option: a question-specific key (opt.<question>.<option>) wins over the shared one. */
export function optionLabelIn(lang: Lang, questionId: string, option: string): string {
  const specific = `opt.${questionId}.${option}`;
  const s = translate(lang, specific);
  return s === specific ? translate(lang, `opt.${option}`) : s;
}
