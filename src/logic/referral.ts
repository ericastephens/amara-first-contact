// Referral: nearest suitable facility, slot choice and on-device referral code.
import type { Facility, FacilityLevel, Slot, Urgency } from "../data/schemas";

const LEVELS: FacilityLevel[] = ["drug_shop", "dispensary", "health_centre", "hospital"];
export const WALKING_KMH = 5;

export interface LatLon {
  lat: number;
  lon: number;
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line walking estimate in minutes (labelled "estimate" in the UI). */
export function walkingMinutes(km: number): number {
  return Math.round((km / WALKING_KMH) * 60);
}

export interface FacilityChoice {
  facility: Facility;
  km: number;
  walkMinutes: number;
}

/** Facilities at or above the required level, nearest first. */
export function suitableFacilities(facilities: Facility[], level: FacilityLevel, from: LatLon): FacilityChoice[] {
  const min = LEVELS.indexOf(level);
  return facilities
    .filter((f) => LEVELS.indexOf(f.level) >= min)
    .map((facility) => {
      const km = haversineKm(from, facility);
      return { facility, km, walkMinutes: walkingMinutes(km) };
    })
    .sort((a, b) => a.km - b.km);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday = 0 ... Sunday = 6 (matches sms_templates.json days). */
export function weekdayIndex(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // Sunday = 0
  return (d + 6) % 7;
}

export const slotKey = (s: Pick<Slot, "facility_id" | "date" | "time">) => `${s.facility_id}|${s.date}|${s.time}`;

/**
 * Pick a slot for the urgency:
 *  - go_now: no slot ("Go now", paper referral) — urgent never waits for a slot.
 *  - refer_today / ask_clinic: earliest free slot today.
 *  - refer_routine: earliest free slot in the next 3 days (today + 1 .. today + 3).
 * `reserved` holds slot keys already used on this device.
 */
export function pickSlot(
  urgency: Urgency,
  facilityId: string,
  slots: Slot[],
  today: string,
  reserved: Set<string> = new Set(),
  after?: Slot,
): Slot | null {
  if (urgency === "go_now" || urgency === "home_care_followup") return null;
  const dates =
    urgency === "refer_routine" ? [addDays(today, 1), addDays(today, 2), addDays(today, 3)] : [today];
  const free = slots
    .filter((s) => s.facility_id === facilityId && s.status === "free" && dates.includes(s.date))
    .filter((s) => !reserved.has(slotKey(s)))
    .filter((s) => !after || `${s.date} ${s.time}` > `${after.date} ${after.time}`)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return free[0] ?? null;
}

/** Choose facility + slot together: nearest suitable facility that has a slot (go_now: nearest, no slot). */
export function chooseReferral(
  urgency: Urgency,
  level: FacilityLevel,
  facilities: Facility[],
  from: LatLon,
  slots: Slot[],
  today: string,
  reserved: Set<string>,
): { choice: FacilityChoice; slot: Slot | null } | null {
  const options = suitableFacilities(facilities, level, from);
  if (options.length === 0) return null;
  if (urgency === "go_now") return { choice: options[0], slot: null };
  for (const choice of options) {
    const slot = pickSlot(urgency, choice.facility.id, slots, today, reserved);
    if (slot) return { choice, slot };
  }
  // No free slot anywhere: still refer to the nearest; the clinic confirms a time on sync.
  return { choice: options[0], slot: null };
}

// ---- referral code: 1 letter + 2 digits, unambiguous alphabet (no O/0, I/1)
export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_DIGITS = "23456789";

export function generateCode(used: Set<string>, random: () => number = Math.random): string {
  const capacity = CODE_LETTERS.length * CODE_DIGITS.length * CODE_DIGITS.length;
  if (used.size >= capacity) throw new Error("No referral codes left on this device");
  for (;;) {
    const code =
      CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)] +
      CODE_DIGITS[Math.floor(random() * CODE_DIGITS.length)] +
      CODE_DIGITS[Math.floor(random() * CODE_DIGITS.length)];
    if (!used.has(code)) return code;
  }
}

const SPOKEN: Record<"en" | "sw", Record<string, string>> = {
  en: { "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine" },
  sw: { "2": "mbili", "3": "tatu", "4": "nne", "5": "tano", "6": "sita", "7": "saba", "8": "nane", "9": "tisa" },
};

export function codeSpoken(code: string, lang: "en" | "sw"): string {
  return [...code].map((ch) => SPOKEN[lang][ch] ?? ch).join(", ");
}
