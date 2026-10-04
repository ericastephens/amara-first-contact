import { describe, expect, it } from "vitest";
import { locales } from "../src/data";
import { countryByIso, countryLanguages, defaultPatientLangs, demoSetup, responderLabel, validSetup, validWorkId } from "../src/setup/setup";

describe("locales.json", () => {
  it("every country's default staff language is one of its staff languages", () => {
    for (const c of locales.countries) expect(c.staff.map((l) => l.code)).toContain(c.staff_default);
  });
  it("no country offers a keypad-only language as a staff language", () => {
    for (const c of locales.countries) for (const l of c.staff) expect(l.support).not.toBe("keypad_audio");
  });
  it("every first-contact role exists", () => {
    const ids = locales.roles.map((r) => r.id);
    for (const c of locales.countries) for (const r of c.first_contacts) expect(ids).toContain(r);
  });
});

describe("setup", () => {
  it("the Tanzania demo setup is valid", () => {
    expect(validSetup(demoSetup("2026-10-05T09:00:00Z"))).toBe(true);
  });
  it("needs a listed region when the country lists regions", () => {
    expect(validSetup({ ...demoSetup(""), region: "Atlantis" })).toBe(false);
  });
  it("outside Tanzania, region and district must both be chosen from the lists", () => {
    const ke = countryByIso("KE")!;
    const base = { country: "KE", role: "chw", workId: "CHW-0042", staffLang: "en", patientLangs: defaultPatientLangs(ke), savedAt: "" };
    expect(validSetup({ ...base, region: "Kiambu", district: "Ruiru" })).toBe(true);
    expect(validSetup({ ...base, region: "Kiambu", district: "" })).toBe(false); // district required
    expect(validSetup({ ...base, region: "Kiambu", district: "Somewhere typed" })).toBe(false); // not in list
    expect(validSetup({ ...base, region: "Kiambu", district: "Westlands" })).toBe(false); // district of another region
    expect(validSetup({ ...base, region: "Atlantis", district: "Ruiru" })).toBe(false);
  });
  it("rejects a staff language from another country or a keypad-only one", () => {
    expect(validSetup({ ...demoSetup(""), staffLang: "am" })).toBe(false);
    expect(validSetup({ ...demoSetup(""), staffLang: "chagga" })).toBe(false);
  });
  it("needs at least one patient language", () => {
    expect(validSetup({ ...demoSetup(""), patientLangs: [] })).toBe(false);
  });
  it("country languages list staff languages first without duplicates", () => {
    const tz = countryLanguages(countryByIso("TZ")!);
    expect(tz[0].code).toBe("sw");
    expect(new Set(tz.map((l) => l.code)).size).toBe(tz.length);
  });
});

describe("work ID", () => {
  it("is required to finish setup", () => {
    expect(validSetup({ ...demoSetup(""), workId: "" })).toBe(false);
    expect(validSetup({ ...demoSetup(""), workId: "  " })).toBe(false);
  });
  it("accepts licence and staff number formats and rejects junk", () => {
    for (const ok of ["ADDO-KLM-0421", "TNMC/12345", "CHW 0042", "MO.123"]) expect(validWorkId(ok)).toBe(true);
    for (const bad of ["", "ab", "-123", "<script>", "x".repeat(31)]) expect(validWorkId(bad)).toBe(false);
  });
  it("is printed in the responder label used on notes", () => {
    expect(responderLabel("Duka la Dawa Ondera", demoSetup(""))).toBe("Duka la Dawa Ondera · Rehema (sample) · Work ID ADDO-KLM-0421");
  });
});
