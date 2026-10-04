#!/usr/bin/env node
// Scaffold a language pack so a translator only has to fill in text. No code change is needed:
// the app picks up both files automatically at the next build.
//
//   node scripts/new_language.mjs tw "Twi"        # creates src/i18n/tw.json and data/sms/tw.json
//   node scripts/new_language.mjs --status        # translation coverage of every language
//
// Empty strings mean "not translated yet": the app shows English (or the country's staff language) instead.
// Existing translations are kept when re-run (new English keys are added as empty strings).
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const write = (p, obj) => writeFileSync(new URL(p, root), JSON.stringify(obj, null, 2) + "\n");

const en = read("src/i18n/en.json");
const sms = read("data/sms_templates.json");

function status() {
  const keys = Object.keys(en).filter((k) => !k.startsWith("_"));
  console.log("UI strings (src/i18n):");
  for (const f of readdirSync(new URL("src/i18n/", root)).filter((f) => f.endsWith(".json"))) {
    const pack = read(`src/i18n/${f}`);
    const done = keys.filter((k) => typeof pack[k] === "string" && pack[k].trim()).length;
    console.log(`  ${f.padEnd(10)} ${String(Math.round((done / keys.length) * 100)).padStart(3)}%  (${done}/${keys.length})`);
  }
  console.log("Messages for the mother (data/sms_templates.json + data/sms/*.json):");
  const ids = Object.keys(sms.templates);
  const langs = new Set(Object.values(sms.templates).flatMap((t) => Object.keys(t)));
  const packs = existsSync(new URL("data/sms/", root)) ? readdirSync(new URL("data/sms/", root)).filter((f) => f.endsWith(".json")) : [];
  for (const l of langs) console.log(`  ${l.padEnd(10)} ${ids.filter((id) => sms.templates[id][l]?.trim()).length}/${ids.length} templates`);
  for (const f of packs) {
    const p = read(`data/sms/${f}`);
    console.log(`  ${p.code.padEnd(10)} ${ids.filter((id) => p.templates[id]?.trim()).length}/${ids.length} templates (pack, review: ${p.review})`);
  }
}

function scaffold(code, name) {
  if (!/^[a-z]{2,3}(-[a-z0-9]+)?$/.test(code)) throw new Error(`Use an ISO 639 code like "tw", "ee" or "gaa" (got "${code}")`);
  // UI strings: every English key, empty unless already translated
  const uiPath = `src/i18n/${code}.json`;
  const ui = existsSync(new URL(uiPath, root)) ? read(uiPath) : {};
  const outUi = {
    _native: ui._native ?? name ?? code,
    _review: ui._review ?? "pending: translate each empty string; keep {placeholders} unchanged; native-speaker review before use",
  };
  for (const k of Object.keys(en)) if (!k.startsWith("_")) outUi[k] = typeof ui[k] === "string" ? ui[k] : "";
  write(uiPath, outUi);

  // Messages for the mother
  mkdirSync(new URL("data/sms/", root), { recursive: true });
  const smsPath = `data/sms/${code}.json`;
  const old = existsSync(new URL(smsPath, root)) ? read(smsPath) : {};
  const blankRecord = (src, prev = {}) => Object.fromEntries(Object.keys(src).map((id) => [id, prev[id] ?? ""]));
  write(smsPath, {
    code,
    name: old.name ?? name ?? code,
    review: old.review ?? "pending: native-speaker review; never add a symptom, diagnosis or test; <= 160 characters filled",
    _help:
      "Placeholders: {name} {clinic} {day} {time} {code} (voice also {responder} {code_spoken}). " +
      "English reference texts are in data/sms_templates.json. Empty = not translated (English is sent).",
    templates: blankRecord(sms.templates, old.templates),
    voice_scripts: blankRecord(sms.voice_scripts, old.voice_scripts),
    days: old.days ?? ["", "", "", "", "", "", ""],
    time_format: old.time_format ?? "12h",
    digits: old.digits ?? { 2: "", 3: "", 4: "", 5: "", 6: "", 7: "", 8: "", 9: "" },
  });
  console.log(`wrote ${uiPath} and ${smsPath}. Fill in the empty strings, then run: npm test`);
}

const [arg, name] = process.argv.slice(2);
if (!arg || arg === "--status") status();
else scaffold(arg, name);
