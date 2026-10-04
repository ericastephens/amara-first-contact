import { createContext, useContext, useState, type ReactNode } from "react";
import { hasUi, UI_PACKS } from "../languages/packs";
import { tr, type Lang, type Localized } from "../logic/lang";

// Every src/i18n/<code>.json is a UI language. Missing strings fall back to English.
export type { Lang };

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Pick the current-language field from a data record (en/sw/... keys), falling back to English. */
  pick: (rec: Localized) => string;
}

const Ctx = createContext<I18n | null>(null);

function readLang(): Lang {
  try {
    const saved = localStorage.getItem("amara.lang");
    return saved && hasUi(saved) ? saved : "sw";
  } catch {
    return "sw";
  }
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = UI_PACKS[lang]?.[key] ?? UI_PACKS.en?.[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = (requested: Lang) => {
    // a language without a UI pack shows English (its patients still get keypad + audio)
    const l = hasUi(requested) ? requested : "en";
    setLangState(l);
    try {
      localStorage.setItem("amara.lang", l);
    } catch {
      // ignore
    }
    document.documentElement.lang = l;
  };
  const value: I18n = {
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    pick: (rec) => tr(rec, lang),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

export function optionLabel(t: I18n["t"], questionId: string, option: string): string {
  const specific = `opt.${questionId}.${option}`;
  const s = t(specific);
  return s === specific ? t(`opt.${option}`) : s;
}
