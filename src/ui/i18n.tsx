import { createContext, useContext, useState, type ReactNode } from "react";
import { translate, type Lang } from "../i18n/translate";

export { translate, type Lang };

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Pick the current-language field from a data record with en/sw keys. */
  pick: (rec: { en: string; sw: string }) => string;
}

const Ctx = createContext<I18n | null>(null);

function readLang(): Lang {
  try {
    return localStorage.getItem("amara.lang") === "en" ? "en" : "sw";
  } catch {
    return "sw";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = (l: Lang) => {
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
    pick: (rec) => rec[lang],
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
