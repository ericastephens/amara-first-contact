// Who the patient is, for the clinic's record and her messages: a phone number, or a national ID when she has
// no phone. Pure functions; nothing here leaves the device except through the referral itself.
//
// Tanzania: the NIDA national identification number (NIN) is 20 digits, usually written
// YYYYMMDD-XXXXX-XXXXX-XX, where the first 8 digits are the date of birth. That lets the app suggest an age
// when she does not know it. Layout confirmed by the Amara Health team (Tanzania), 3 Oct 2026; no official NIDA
// specification cited yet.

export interface NationalIdSpec {
  /** Short name shown in the form ("NIDA", "National ID"). */
  name: string;
  /** Exact number of digits, when the format is known. */
  digits?: number;
  /** The first 8 digits are the date of birth (YYYYMMDD). */
  birthDatePrefix?: boolean;
  example?: string;
}

const SPECS: Record<string, NationalIdSpec> = {
  TZ: { name: "NIDA", digits: 20, birthDatePrefix: true, example: "19850315-12345-00001-23" },
};

export function nationalIdSpec(countryIso: string | undefined): NationalIdSpec {
  return (countryIso && SPECS[countryIso]) || { name: "National ID" };
}

const digitsOnly = (s: string) => s.replace(/[^0-9]/g, "");

/** Phone number in international form (+255712345678), or null if it does not look like a phone number. */
export function normalizePhone(raw: string, dial = "+255"): string | null {
  const s = raw.trim();
  if (!s) return null;
  const d = digitsOnly(s);
  const cc = digitsOnly(dial);
  if (cc === "255") {
    // Tanzania: 0 + 9 digits, 255 + 9 digits, or 9 digits; mobile numbers start with 6 or 7
    const local = d.startsWith("255") ? d.slice(3) : d.startsWith("0") ? d.slice(1) : d;
    return /^[67]\d{8}$/.test(local) ? `+255${local}` : null;
  }
  // elsewhere: accept 8–15 digits, with or without the country code
  if (s.startsWith("+")) return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
  const local = d.startsWith("0") ? d.slice(1) : d;
  if (local.length >= 7 && local.length <= 12) return `+${cc}${local}`;
  return null;
}

function dateFromYmd(ymd: string): Date | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  const d = new Date(Date.UTC(y, m - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day) return null;
  if (y < 1900) return null;
  return d;
}

/** Plausible national ID for the country (format only; it is not checked against any register). */
export function validNationalId(raw: string, countryIso: string | undefined, today = new Date()): boolean {
  const spec = nationalIdSpec(countryIso);
  if (spec.digits) {
    const d = digitsOnly(raw);
    if (d.length !== spec.digits) return false;
    if (spec.birthDatePrefix) {
      const born = dateFromYmd(d.slice(0, 8));
      return born !== null && born.getTime() <= today.getTime();
    }
    return true;
  }
  return /^[A-Za-z0-9][A-Za-z0-9 -]{3,29}$/.test(raw.trim());
}

/** Date of birth (YYYY-MM-DD) read from a national ID that carries it, else null. */
export function birthDateFromId(raw: string, countryIso: string | undefined, today = new Date()): string | null {
  const spec = nationalIdSpec(countryIso);
  if (!spec.birthDatePrefix || !validNationalId(raw, countryIso, today)) return null;
  const d = digitsOnly(raw);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Age in whole years on `today`, from a national ID that carries the date of birth. */
export function ageFromId(raw: string, countryIso: string | undefined, today = new Date()): number | null {
  const born = birthDateFromId(raw, countryIso, today);
  if (!born) return null;
  const [y, m, d] = born.split("-").map(Number);
  let age = today.getUTCFullYear() - y;
  const beforeBirthday = today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Show only the last digits of an ID on screens and notes that others may see. */
export function maskId(raw: string): string {
  const d = raw.replace(/[^0-9A-Za-z]/g, "");
  return d.length <= 4 ? d : `•••• ${d.slice(-4)}`;
}

export interface IdentityInput {
  phone: string;
  noPhone?: boolean;
  nationalId?: string;
}

/** Every patient needs a phone number, or, when she has no phone, a national ID. */
export function identityComplete(e: IdentityInput, countryIso: string | undefined, dial?: string, today = new Date()): boolean {
  if (!e.noPhone) return normalizePhone(e.phone, dial) !== null;
  return validNationalId(e.nationalId ?? "", countryIso, today);
}
