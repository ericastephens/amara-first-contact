import { describe, expect, it } from "vitest";
import {
  ageFromId,
  birthDateFromId,
  identityComplete,
  maskId,
  nationalIdSpec,
  normalizePhone,
  validNationalId,
} from "../src/logic/identity";

const today = new Date("2026-10-03T12:00:00Z");

describe("phone numbers", () => {
  it("accepts Tanzanian mobile numbers in the usual forms", () => {
    expect(normalizePhone("0712 345 678", "+255")).toBe("+255712345678");
    expect(normalizePhone("+255 712 345 678", "+255")).toBe("+255712345678");
    expect(normalizePhone("255712345678", "+255")).toBe("+255712345678");
    expect(normalizePhone("0612345678", "+255")).toBe("+255612345678");
  });
  it("rejects numbers that cannot be a Tanzanian mobile", () => {
    expect(normalizePhone("", "+255")).toBeNull();
    expect(normalizePhone("12345", "+255")).toBeNull();
    expect(normalizePhone("0212345678", "+255")).toBeNull(); // landline prefix
    expect(normalizePhone("07123456789", "+255")).toBeNull(); // one digit too many
  });
  it("is lenient elsewhere", () => {
    expect(normalizePhone("0712345678", "+254")).toBe("+254712345678");
    expect(normalizePhone("+233 24 123 4567", "+233")).toBe("+233241234567");
  });
});

describe("national ID (NIDA in Tanzania)", () => {
  const nida = "19850315-12345-00001-23";
  it("uses NIDA for Tanzania and a generic ID elsewhere", () => {
    expect(nationalIdSpec("TZ").name).toBe("NIDA");
    expect(nationalIdSpec("KE").name).toBe("National ID");
  });
  it("checks the 20 digits and the birth date at the start", () => {
    expect(validNationalId(nida, "TZ", today)).toBe(true);
    expect(validNationalId("19850315123450000123", "TZ", today)).toBe(true);
    expect(validNationalId("1985031512345", "TZ", today)).toBe(false); // too short
    expect(validNationalId("19851345-12345-00001-23", "TZ", today)).toBe(false); // month 13
    expect(validNationalId("20301231-12345-00001-23", "TZ", today)).toBe(false); // born in the future
  });
  it("reads her date of birth and age, so she need not know it", () => {
    expect(birthDateFromId(nida, "TZ", today)).toBe("1985-03-15");
    expect(ageFromId(nida, "TZ", today)).toBe(41);
    expect(ageFromId("19851231-12345-00001-23", "TZ", today)).toBe(40); // birthday not reached yet this year
    expect(ageFromId("A1234567", "KE", today)).toBeNull(); // no birth date in a generic ID
  });
  it("shows only the last digits", () => {
    expect(maskId(nida)).toBe("•••• 0123");
  });
});

describe("every patient needs a phone, or a national ID when she has none", () => {
  it("phone is enough", () => {
    expect(identityComplete({ phone: "0712345678" }, "TZ", "+255", today)).toBe(true);
  });
  it("no phone and no ID is not enough", () => {
    expect(identityComplete({ phone: "" }, "TZ", "+255", today)).toBe(false);
    expect(identityComplete({ phone: "", noPhone: true }, "TZ", "+255", today)).toBe(false);
  });
  it("no phone with a valid NIDA is enough", () => {
    expect(identityComplete({ phone: "", noPhone: true, nationalId: "19850315-12345-00001-23" }, "TZ", "+255", today)).toBe(true);
  });
});
