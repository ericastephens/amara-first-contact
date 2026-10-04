// SMS and voice texts for the mother. Only name, clinic, day, time and code: never a symptom,
// diagnosis or test. Max 160 characters after filling.
import type { SmsDoc } from "../data/schemas";
import { codeSpoken, weekdayIndex } from "./referral";
import type { Lang } from "./lang";

export const SMS_MAX = 160;
export type { Lang };

/** Swahili time starts at 7am = saa moja. See sms_templates.json swahili_time_note. */
export function swahiliTime(hhmm: string): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  const swHour = ((hour + 5) % 12) + 1;
  let period: string;
  if (hour >= 7 && hour <= 11) period = "asubuhi";
  else if (hour >= 12 && hour <= 15) period = "mchana";
  else if (hour >= 16 && hour <= 18) period = "jioni";
  else period = "usiku";
  let mins = "";
  if (minute === 30) mins = " na nusu";
  else if (minute === 15) mins = " na robo";
  else if (minute !== 0) mins = ` na dakika ${minute}`;
  return `saa ${swHour}${mins} ${period}`;
}

export function englishTime(hhmm: string): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in values)) throw new Error(`Missing SMS value: ${k}`);
    return values[k];
  });
}

export interface SmsInput {
  name: string;
  clinic: string;
  date?: string; // ISO date of the slot
  time?: string; // HH:MM
  code: string;
}

/** Time written the way this language's messages expect (sms time_format; Swahili time for "sw"). */
export function formatTime(sms: SmsDoc, lang: Lang, hhmm: string): string {
  const f = sms.time_format?.[lang] ?? (lang === "sw" ? "swahili" : "12h");
  if (f === "swahili") return swahiliTime(hhmm);
  if (f === "24h") return hhmm;
  return englishTime(hhmm);
}

export function dayName(sms: SmsDoc, lang: Lang, isoDate: string): string {
  return (sms.days[lang] ?? sms.days.en)[weekdayIndex(isoDate)];
}

/** Languages that have this SMS template (in the order of the file). */
export function hasTemplate(sms: SmsDoc, templateId: string, lang: Lang): boolean {
  return Boolean(sms.templates[templateId]?.[lang]?.trim());
}

function values(sms: SmsDoc, lang: Lang, input: SmsInput, name: string): Record<string, string> {
  return {
    name,
    clinic: input.clinic,
    day: input.date ? dayName(sms, lang, input.date) : "",
    time: input.time ? formatTime(sms, lang, input.time) : "",
    time_sw: input.time ? swahiliTime(input.time) : "",
    time_en: input.time ? englishTime(input.time) : "",
    code: input.code,
  };
}

function defaultName(lang: Lang): string {
  return lang === "sw" ? "Mama" : "Mother";
}

/** Render a template; shortens the name if needed so the message never exceeds 160 characters. */
export function renderSms(sms: SmsDoc, templateId: string, requested: Lang, input: SmsInput): string {
  // a language pack may not have every message yet: that one message is sent in English
  const lang = hasTemplate(sms, templateId, requested) ? requested : "en";
  const tpl = sms.templates[templateId]?.[lang];
  if (!tpl) throw new Error(`Unknown SMS template ${templateId}.${lang}`);
  let name = input.name.trim().split(/\s+/)[0] || defaultName(lang);
  let text = fillTemplate(tpl, values(sms, lang, input, name));
  while (text.length > SMS_MAX && name.length > 1) {
    name = name.slice(0, -1);
    text = fillTemplate(tpl, values(sms, lang, input, name));
  }
  if (text.length > SMS_MAX) throw new Error(`SMS ${templateId}.${lang} is ${text.length} characters`);
  return text;
}

export function renderVoice(
  sms: SmsDoc,
  scriptId: string,
  lang: Lang,
  input: SmsInput & { responder: string },
): string {
  const tpl = sms.voice_scripts[scriptId]?.[lang];
  // no voice script in this language yet: the call reads the SMS text instead
  if (!tpl?.trim()) return renderSms(sms, scriptId, lang, input);
  return fillTemplate(tpl, {
    ...values(sms, lang, input, input.name.trim().split(/\s+/)[0] || defaultName(lang)),
    responder: input.responder,
    code_spoken: codeSpoken(input.code, lang, sms.digits?.[lang]),
  });
}

/** Lower-cased text with punctuation removed, for banned-word checks. */
export function normaliseForCheck(text: string): string {
  return ` ${text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}
