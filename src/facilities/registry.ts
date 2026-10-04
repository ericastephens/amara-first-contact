// Facility registry: which clinics the app refers to, ranked from the first responder's own location.
//
// Sources, best first:
//  1. Real facilities fetched on this device from OpenStreetMap (Overpass API) around the responder's
//     GPS position or the place typed in setup, then saved for offline use.
//  2. Real facilities baked in at build time (data/facilities_osm_*.json, written by
//     scripts/fetch_facilities_osm.py in CI).
//  3. The synthetic sample clinics in data/facilities_sample.json (labelled "Sample data").
// OpenStreetMap does not hold appointment slots, so slots for real clinics are simulated and labelled.
import { facilitiesDoc, slotsDoc } from "../data";
import type { Facility, FacilityLevel, Slot } from "../data/schemas";
import { addDays, haversineKm } from "../logic/referral";
import { getSetup } from "../setup/setup";

export interface Place {
  lat: number;
  lon: number;
  /** How the position was found. */
  method: "gps" | "place" | "sample";
  label: string;
  accuracyM?: number;
}

export interface Registry {
  source: "osm_live" | "osm_build" | "sample";
  fetchedAt?: string;
  center: Place;
  radiusKm: number;
  facilities: Facility[];
  /** Simulated referral slots for real clinics (OpenStreetMap has none). */
  slots: Slot[];
}

const KEY = "amara.facilities.v1";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";
// Main Overpass server first, then public mirrors (the main one is often busy).
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Facilities baked in at build time, if CI produced any. Unit tests always use the fixed sample clinics,
// so their results do not depend on what OpenStreetMap held on the day of the build.
const BUILT = import.meta.env.MODE === "test" ? undefined : Object.values(
  import.meta.glob<{ default: { facilities: Facility[]; bbox?: string } }>("../../data/facilities_osm_*.json", { eager: true }),
)[0]?.default;

let cache: Registry | null | undefined;

function sampleRegistry(): Registry {
  const site = facilitiesDoc.responder_sites[0];
  return {
    source: "sample",
    center: { lat: site.lat, lon: site.lon, method: "sample", label: site.name },
    radiusKm: 25,
    facilities: facilitiesDoc.facilities,
    slots: slotsDoc.slots,
  };
}

function builtRegistry(): Registry | null {
  if (!BUILT?.facilities?.length) return null;
  const fs = BUILT.facilities.filter((f) => f.level !== "drug_shop" && referableName(f.name));
  const lat = fs.reduce((a, f) => a + f.lat, 0) / fs.length;
  const lon = fs.reduce((a, f) => a + f.lon, 0) / fs.length;
  return {
    source: "osm_build",
    center: { lat, lon, method: "place", label: "Kilimanjaro (OpenStreetMap)" },
    radiusKm: 30,
    facilities: fs,
    slots: simulatedSlots(fs, slotsDoc.demo_today),
  };
}

export function getRegistry(): Registry {
  if (cache) return cache;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) cache = JSON.parse(raw) as Registry;
  } catch {
    cache = null;
  }
  return cache ?? builtRegistry() ?? sampleRegistry();
}

function saveRegistry(r: Registry): void {
  cache = r;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(r));
  } catch {
    // storage full or blocked: keep for this session
  }
}

export function clearRegistry(): void {
  cache = null;
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // ignore
  }
}

export const activeFacilities = (): Facility[] => getRegistry().facilities;
export const activeSlots = (): Slot[] => getRegistry().slots;
export const facilitiesAreReal = (): boolean => getRegistry().source !== "sample";

/** Where the first responder is: distances and the nearest clinics are measured from here. */
export function responderSite(): { id: string; name: string; ward: string; lat: number; lon: number } {
  const r = getRegistry();
  const sample = facilitiesDoc.responder_sites[0];
  if (r.source === "sample") return sample;
  const s = getSetup();
  const place = s ? [s.district, s.region].filter(Boolean).join(", ") : r.center.label;
  return { id: "R-local", name: place || r.center.label, ward: s?.district || s?.region || "", lat: r.center.lat, lon: r.center.lon };
}

export function findFacility(id: string): Facility | undefined {
  return activeFacilities().find((f) => f.id === id) ?? facilitiesDoc.facilities.find((f) => f.id === id);
}

// ---------------------------------------------------------------- mapping OpenStreetMap tags

export interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Facility level from OSM tags and Tanzanian / English naming conventions. */
export function levelFromOsm(tags: Record<string, string>): FacilityLevel {
  const name = `${tags.name ?? ""} ${tags["name:en"] ?? ""} ${tags["name:sw"] ?? ""}`.toLowerCase();
  const kind = tags.amenity ?? tags.healthcare ?? "";
  if (kind === "pharmacy" || /duka la dawa|pharmacy|chemist|addo/.test(name)) return "drug_shop";
  if (kind === "hospital" || /hospital|hospitali/.test(name)) return "hospital";
  if (/kituo cha afya|health cent(er|re)/.test(name) || kind === "centre") return "health_centre";
  if (/zahanati|dispensary/.test(name)) return "dispensary";
  return kind === "clinic" ? "health_centre" : "dispensary";
}

/** Names that cannot be a referral target: traditional healers, or a bare generic word with no place name. */
const NOT_REFERABLE = /traditional|herbal|mganga|tiba asili/i;
const GENERIC_ONLY = /^(hospital|hospitali|clinic|kliniki|dispensary|zahanati|health cent(er|re)|kituo cha afya|duka la dawa|pharmacy)$/i;
export function referableName(name: string): boolean {
  const n = name.trim();
  return n.length > 2 && !NOT_REFERABLE.test(n) && !GENERIC_ONLY.test(n);
}

export function facilitiesFromOsm(elements: OsmElement[]): Facility[] {
  const out: Facility[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    const tags = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const name = tags.name ?? tags["name:sw"] ?? tags["name:en"];
    if (lat === undefined || lon === undefined || !name || !referableName(name)) continue; // unnamed or generic points cannot be referred to
    const level = levelFromOsm(tags);
    if (level === "drug_shop") continue; // referrals go to clinics, not to other drug shops
    const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `osm-${e.type}-${e.id}`,
      name,
      name_en: tags["name:en"] ?? name,
      level,
      lat,
      lon,
      ward: tags["addr:suburb"] ?? tags["addr:village"] ?? tags["addr:city"] ?? tags["is_in:ward"] ?? "",
      phone_sms: tags.phone ?? tags["contact:phone"],
      synthetic: false,
    });
  }
  return out;
}

const SLOT_TIMES: Record<FacilityLevel, string[]> = {
  drug_shop: [],
  dispensary: ["08:30", "09:00", "09:30", "10:00", "14:00"],
  health_centre: ["08:00", "08:30", "09:00", "10:00", "11:00", "14:00"],
  hospital: ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00"],
};

/** Simulated referral slots for the next 4 days (labelled "Sample data" in the app). */
export function simulatedSlots(facilities: Facility[], today: string): Slot[] {
  const slots: Slot[] = [];
  for (const f of facilities)
    for (let d = 0; d < 4; d++)
      for (const time of SLOT_TIMES[f.level]) slots.push({ facility_id: f.id, date: addDays(today, d), time, status: "free" });
  return slots;
}

// ---------------------------------------------------------------- network (online only)

/** Ask the device for its GPS position. Rejects if the user refuses or there is no fix. */
export function gpsPosition(timeoutMs = 15000): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("no_gps"));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracyM: Math.round(p.coords.accuracy),
          method: "gps",
          label: "GPS",
        }),
      (err) => reject(new Error(err.code === 1 ? "gps_denied" : "gps_failed")),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 300000 },
    );
  });
}

/** Find the place typed in setup ("Hai, Kilimanjaro, Tanzania") with OpenStreetMap Nominatim. */
export async function geocode(query: string, countryIso?: string): Promise<Place> {
  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}${countryIso ? `&countrycodes=${countryIso.toLowerCase()}` : ""}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`geocode_${res.status}`);
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (!rows.length) throw new Error("place_not_found");
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon), method: "place", label: query };
}

/** Fetch real clinics within radiusKm of the responder, rank by distance, save for offline use. */
export async function loadNearby(center: Place, today: string, radiusKm = 25): Promise<Registry> {
  const r = Math.round(radiusKm * 1000);
  const around = `(around:${r},${center.lat},${center.lon})`;
  const query = `[out:json][timeout:40];(nwr["amenity"~"^(hospital|clinic|doctors)$"]${around};nwr["healthcare"~"^(hospital|clinic|centre)$"]${around};);out center tags;`;
  let json: { elements: OsmElement[] } | null = null;
  let lastError: unknown = null;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`overpass_${res.status}`);
      json = (await res.json()) as { elements: OsmElement[] };
      break;
    } catch (e) {
      lastError = e; // busy or unreachable: try the next server
    }
  }
  if (!json) throw lastError instanceof Error ? lastError : new Error("overpass_failed");
  const facilities = facilitiesFromOsm(json.elements).sort((a, b) => haversineKm(center, a) - haversineKm(center, b));
  if (facilities.length === 0) throw new Error("no_facilities_found");
  const reg: Registry = {
    source: "osm_live",
    fetchedAt: new Date().toISOString(),
    center,
    radiusKm,
    facilities,
    slots: simulatedSlots(facilities, today),
  };
  saveRegistry(reg);
  return reg;
}
