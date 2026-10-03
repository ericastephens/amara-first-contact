// SMS and voice texts for the mother. Only name, clinic, day, time and code: never a symptom,
// diagnosis or test. Max 160 characters after filling.
import type { SmsDoc } from "../data/schemas";
import { codeSpoken, weekdayIndex } from "./referral";

export const SMS_MAX = 160;
export type Lang = "en" | "sw";

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

function values(sms: SmsDoc, lang: Lang, input: SmsInput, name: string): Record<string, string> {
  return {
    name,
    clinic: input.clinic,
    day: input.date ? sms.days[lang][weekdayIndex(input.date)] : "",
    time_sw: input.time ? swahiliTime(input.time) : "",
    time_en: input.time ? englishTime(input.time) : "",
    code: input.code,
  };
}

/** Render a template; shortens the name if needed so the message never exceeds 160 characters. */
export function renderSms(sms: SmsDoc, templateId: string, lang: Lang, input: SmsInput): string {
  const tpl = sms.templates[templateId]?.[lang];
  if (!tpl) throw new Error(`Unknown SMS template ${templateId}.${lang}`);
  let name = input.name.trim().split(/\s+/)[0] || (lang === "sw" ? "Mama" : "Mother");
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
  if (!tpl) throw new Error(`Unknown voice script ${scriptId}.${lang}`);
  return fillTemplate(tpl, {
    ...values(sms, lang, input, input.name.trim().split(/\s+/)[0] || (lang === "sw" ? "Mama" : "Mother")),
    responder: input.responder,
    code_spoken: codeSpoken(input.code, lang),
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
