// Language helpers. Any language code can be used; text that has not been translated yet falls back
// along a chain (the requested language, then the given fallbacks, then English) instead of failing.

/** A language code: "en", "sw", "tw" (Twi), "x-custom" ... */
export type Lang = string;

/** Any record that carries its text per language code; English is always present. */
export type Localized = { en: string };

/** Pick the best available translation of a record. Empty strings count as "not translated". */
export function tr(rec: Localized, lang: Lang, fallbacks: Lang[] = []): string {
  const r = rec as unknown as Record<string, unknown>;
  for (const l of [lang, ...fallbacks, "en"]) {
    const v = r[l];
    if (typeof v === "string" && v.trim()) return v;
  }
  return rec.en;
}

/** First language in the chain for which `has` is true (English is the last resort). */
export function firstAvailable(chain: (Lang | undefined)[], has: (lang: Lang) => boolean): Lang {
  for (const l of chain) if (l && has(l)) return l;
  return "en";
}
