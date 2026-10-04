import { afterEach, describe, expect, it } from "vitest";
import { adminAreas, locales, smsDoc } from "../src/data";
import { mergeSmsPacks } from "../src/data";
import { effectiveSupport, hasSms, hasUi, uiCoverage, uiLanguages } from "../src/languages/packs";
import { firstAvailable, tr } from "../src/logic/lang";
import { formatTime, renderSms, renderVoice, SMS_MAX } from "../src/logic/sms";
import {
  clearSetup,
  countryByIso,
  defaultPatientLangs,
  districtIsSelectOnly,
  districtOptions,
  regionOptions,
  saveSetup,
  staffLanguages,
  uiLanguageChoices,
  validPlace,
} from "../src/setup/setup";
import { messageLang } from "../src/services/referrals";
import { newEncounter } from "../src/logic/encounter";
import type { SmsDoc } from "../src/data/schemas";

afterEach(() => clearSetup());

describe("select-only regions and districts outside Tanzania", () => {
  const others = locales.countries.filter((c) => c.iso !== "TZ");

  it("every country except Tanzania has a region and district list", () => {
    for (const c of others) {
      expect(adminAreas.countries[c.iso], c.name).toBeDefined();
      expect(districtIsSelectOnly(c), c.name).toBe(true);
      const regions = regionOptions(c);
      expect(regions.length, c.name).toBeGreaterThan(0);
      expect(regions.reduce((n, r) => n + r.districts.length, 0), c.name).toBeGreaterThan(0);
    }
  });

  it("names are unique within each list and records its source and licence", () => {
    for (const [iso, c] of Object.entries(adminAreas.countries)) {
      expect(new Set(c.regions.map((r) => r.name)).size, iso).toBe(c.regions.length);
      for (const r of c.regions) expect(new Set(r.districts).size, `${iso} ${r.name}`).toBe(r.districts.length);
      expect(c.licence.length, iso).toBeGreaterThan(0);
      expect(c.source, iso).toMatch(/geoBoundaries/);
    }
  });

  it("Ghana: 16 regions, districts depend on the region chosen", () => {
    const gh = countryByIso("GH")!;
    expect(regionOptions(gh)).toHaveLength(16);
    const ashanti = districtOptions(gh, "Ashanti Region");
    expect(ashanti.length).toBeGreaterThan(30);
    expect(validPlace(gh, "Ashanti Region", ashanti[0])).toBe(true);
    expect(validPlace(gh, "Ashanti Region", "Kumasi typed by hand")).toBe(false);
    expect(validPlace(gh, "Volta Region", ashanti[0])).toBe(false);
    expect(districtOptions(gh, undefined)).toEqual([]);
  });

  it("Tanzania keeps its curated region list (district not restricted)", () => {
    const tz = countryByIso("TZ")!;
    expect(adminAreas.countries.TZ).toBeUndefined();
    expect(regionOptions(tz).map((r) => r.name)).toEqual(tz.regions);
    expect(districtIsSelectOnly(tz)).toBe(false);
    expect(validPlace(tz, "Kilimanjaro", "Hai")).toBe(true);
  });
});

describe("language fallbacks", () => {
  it("tr picks the language, then fallbacks, then English; empty means untranslated", () => {
    const rec = { en: "Go now", sw: "Nenda sasa", tw: "" };
    expect(tr(rec, "sw")).toBe("Nenda sasa");
    expect(tr(rec, "tw")).toBe("Go now");
    expect(tr(rec, "tw", ["sw"])).toBe("Nenda sasa");
  });

  it("firstAvailable ends with English", () => {
    expect(firstAvailable(["tw", "sw"], (l) => l === "sw")).toBe("sw");
    expect(firstAvailable(["tw"], () => false)).toBe("en");
  });

  it("English and Swahili are full UI languages; the empty Twi scaffold is not used yet", () => {
    expect(uiCoverage("en")).toBe(1);
    expect(uiCoverage("sw")).toBe(1);
    expect(hasUi("tw")).toBe(false);
    expect(uiLanguages()).toEqual(["sw", "en"]);
  });
});

describe("Ghana / Twi", () => {
  const gh = countryByIso("GH")!;
  const twi = gh.patient_local.find((l) => l.code === "tw")!;

  it("Twi stays keypad + audio until its pack is translated", () => {
    expect(hasSms("tw")).toBe(false);
    expect(effectiveSupport(twi)).toBe("keypad_audio");
    expect(staffLanguages(gh).map((l) => l.code)).toEqual(["en"]);
  });

  it("a Twi-speaking patient in Ghana gets English messages, never Swahili", () => {
    saveSetup({ country: "GH", region: "Ashanti Region", district: districtOptions(gh, "Ashanti Region")[0], role: "chw", workId: "CHW-GH-01", staffLang: "en", patientLangs: defaultPatientLangs(gh), savedAt: "" });
    const enc = newEncounter("pregnant", "2026-10-05T09:00:00Z", "e1");
    enc.answers.q_language = "tw";
    expect(messageLang(enc)).toBe("en");
    expect(uiLanguageChoices()).toEqual(["en"]);
  });

  it("Tanzania: a Chagga-speaking patient still gets Swahili messages", () => {
    const tz = countryByIso("TZ")!;
    saveSetup({ country: "TZ", region: "Kilimanjaro", district: "Hai", role: "drug_shop", workId: "ADDO-1", staffLang: "sw", patientLangs: defaultPatientLangs(tz), savedAt: "" });
    const enc = newEncounter("pregnant", "2026-10-05T09:00:00Z", "e2");
    enc.answers.q_language = "chagga";
    expect(messageLang(enc)).toBe("sw");
  });
});

describe("adding a language pack (data/sms/<code>.json) needs no code change", () => {
  // A made-up test pack: it shows the mechanism, it is not a Twi translation.
  const pack = {
    code: "xx",
    name: "Test language",
    review: "test fixture",
    templates: { referral: "XX {name} {clinic} {day} {time} {code}.", go_now: "" },
    voice_scripts: {},
    days: ["D1", "D2", "D3", "D4", "D5", "D6", "D7"],
    time_format: "24h",
    digits: { 2: "two-x", 3: "three-x", 4: "four-x", 5: "five-x", 6: "six-x", 7: "seven-x", 8: "eight-x", 9: "nine-x" },
  };
  const merged: SmsDoc = mergeSmsPacks(smsDoc, { "data/sms/xx.json": pack });
  const input = { name: "Ama", clinic: "Clinic A", date: "2026-10-05", time: "14:00", code: "K47" };

  it("uses the pack's template, day names and time format", () => {
    expect(renderSms(merged, "referral", "xx", input)).toBe("XX Ama Clinic A D1 14:00 K47.");
    expect(formatTime(merged, "xx", "14:00")).toBe("14:00");
  });

  it("an untranslated message (empty string) falls back to English", () => {
    expect(renderSms(merged, "go_now", "xx", input)).toBe(renderSms(merged, "go_now", "en", input));
  });

  it("a voice call without a voice script reads the SMS text", () => {
    expect(renderVoice(merged, "referral", "xx", { ...input, responder: "R" })).toBe("XX Ama Clinic A D1 14:00 K47.");
  });

  it("does not change the base messages", () => {
    expect(smsDoc.templates.referral.xx).toBeUndefined();
  });
});

describe("every message in every language stays within 160 characters", () => {
  it("all languages present in sms templates", () => {
    const langs = new Set(Object.values(smsDoc.templates).flatMap((t) => Object.keys(t)));
    for (const lang of langs) {
      for (const id of Object.keys(smsDoc.templates)) {
        if (!smsDoc.templates[id][lang]?.trim() || id === "outbreak_alert_public") continue;
        const text = renderSms(smsDoc, id, lang, { name: "Mwanaidi", clinic: "Hospitali ya Wilaya ya Ondera", date: "2026-10-07", time: "14:00", code: "K47" });
        expect(text.length, `${id}.${lang}`).toBeLessThanOrEqual(SMS_MAX);
      }
    }
  });
});
