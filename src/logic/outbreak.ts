// EARS-style outbreak detection, per ward and syndrome, for the latest reporting week.
// Flag when this week's count >= min_count AND count > mean + sd_multiplier * SD (population SD)
// of the previous baseline_weeks. Same method as scripts/check_data.py. A human approves escalation.
import type { Facility, OutbreakRow, RulesDoc } from "../data/schemas";
import { haversineKm } from "./referral";

export interface OutbreakFlag {
  ward: string;
  syndrome: string;
  isoYear: number;
  isoWeek: number;
  count: number;
  mean: number;
  sd: number;
  threshold: number;
  baseline: number[];
}

export type OutbreakConfig = RulesDoc["outbreak"];

/** Extra cases from synced encounters, added to the latest reporting week. */
export interface SyncedCount {
  ward: string;
  syndrome: string;
  count: number;
}

export function weekKey(year: number, week: number): number {
  return year * 100 + week;
}

export function latestWeek(rows: OutbreakRow[]): { isoYear: number; isoWeek: number } {
  const best = rows.reduce((b, r) => (weekKey(r.iso_year, r.iso_week) > weekKey(b.iso_year, b.iso_week) ? r : b));
  return { isoYear: best.iso_year, isoWeek: best.iso_week };
}

/** Merge synced encounter counts into the latest reporting week of the CSV. */
export function mergeCounts(rows: OutbreakRow[], extra: SyncedCount[]): OutbreakRow[] {
  if (extra.length === 0) return rows;
  const { isoYear, isoWeek } = latestWeek(rows);
  const out = rows.map((r) => ({ ...r }));
  for (const e of extra) {
    const row = out.find((r) => r.iso_year === isoYear && r.iso_week === isoWeek && r.ward === e.ward && r.syndrome === e.syndrome);
    if (row) row.count += e.count;
    else
      out.push({ iso_year: isoYear, iso_week: isoWeek, ward: e.ward, syndrome: e.syndrome, count: e.count, reporting_sites: 1, synthetic: false });
  }
  return out;
}

export function series(rows: OutbreakRow[], ward: string, syndrome: string): OutbreakRow[] {
  return rows
    .filter((r) => r.ward === ward && r.syndrome === syndrome)
    .sort((a, b) => weekKey(a.iso_year, a.iso_week) - weekKey(b.iso_year, b.iso_week));
}

export function detectOutbreaks(rows: OutbreakRow[], cfg: OutbreakConfig): OutbreakFlag[] {
  if (rows.length === 0) return [];
  const { isoYear, isoWeek } = latestWeek(rows);
  const flags: OutbreakFlag[] = [];
  const wards = [...new Set(rows.map((r) => r.ward))].sort();
  const syndromes = [...new Set(rows.map((r) => r.syndrome))].sort();
  for (const ward of wards) {
    for (const syndrome of syndromes) {
      const s = series(rows, ward, syndrome);
      const current = s[s.length - 1];
      if (!current || current.iso_year !== isoYear || current.iso_week !== isoWeek) continue;
      const baseline = s.slice(-1 - cfg.baseline_weeks, -1).map((r) => r.count);
      if (baseline.length < cfg.baseline_weeks) continue;
      const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
      const sd = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length);
      const threshold = mean + cfg.sd_multiplier * sd;
      if (current.count >= cfg.min_count && current.count > threshold) {
        flags.push({ ward, syndrome, isoYear, isoWeek, count: current.count, mean, sd, threshold, baseline });
      }
    }
  }
  return flags;
}

/** Centre of a ward: mean position of the facilities in it. */
export function wardCentre(facilities: Facility[], ward: string): { lat: number; lon: number } | null {
  const inWard = facilities.filter((f) => f.ward === ward);
  if (inWard.length === 0) return null;
  return {
    lat: inWard.reduce((a, f) => a + f.lat, 0) / inWard.length,
    lon: inWard.reduce((a, f) => a + f.lon, 0) / inWard.length,
  };
}

/** Clinics that receive the knowledge-sharing card: within share_radius_km of the flagged ward. */
export function clinicsToNotify(facilities: Facility[], ward: string, radiusKm: number): { facility: Facility; km: number }[] {
  const centre = wardCentre(facilities, ward);
  if (!centre) return [];
  return facilities
    .map((facility) => ({ facility, km: haversineKm(centre, facility) }))
    .filter((x) => x.km <= radiusKm)
    .sort((a, b) => a.km - b.km);
}

export interface EscalationDraft {
  id: string;
  status: "draft" | "approved_queued" | "sent";
  createdAt: string;
  approvedBy?: { role: "clinician" | "district"; at: string };
  sentAt?: string;
  // eIDSR-like fields
  syndrome: string;
  syndromeName: string;
  immediatelyNotifiable: boolean;
  ward: string;
  isoYear: number;
  isoWeek: number;
  casesThisWeek: number;
  baselineMean: number;
  threshold: number;
  weekStart: string;
  weekEnd: string;
  reportingFacility: string;
  source: string;
}

/** Monday of an ISO week, as YYYY-MM-DD. */
export function isoWeekStart(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

export function isoWeekOf(isoDate: string): { isoYear: number; isoWeek: number } {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  return { isoYear, isoWeek: Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7) };
}

/**
 * Create an escalation draft for a flag. It stays a draft until a Clinician or District user approves it.
 * Drafts are created when the syndrome is immediately notifiable or the threshold is crossed (always true for a flag).
 */
export function draftEscalation(
  flag: OutbreakFlag,
  cfg: OutbreakConfig,
  reportingFacility: string,
  now: string,
): EscalationDraft | null {
  const syn = cfg.syndromes.find((s) => s.id === flag.syndrome);
  const crossed = flag.count >= cfg.min_count && flag.count > flag.threshold;
  if (!syn?.immediately_notifiable && !crossed) return null;
  const weekStart = isoWeekStart(flag.isoYear, flag.isoWeek);
  const end = new Date(`${weekStart}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    id: `esc-${flag.ward}-${flag.syndrome}-${flag.isoYear}w${flag.isoWeek}`,
    status: "draft",
    createdAt: now,
    syndrome: flag.syndrome,
    syndromeName: syn?.en ?? flag.syndrome,
    immediatelyNotifiable: syn?.immediately_notifiable ?? false,
    ward: flag.ward,
    isoYear: flag.isoYear,
    isoWeek: flag.isoWeek,
    casesThisWeek: flag.count,
    baselineMean: Math.round(flag.mean * 100) / 100,
    threshold: Math.round(flag.threshold * 100) / 100,
    weekStart,
    weekEnd: end.toISOString().slice(0, 10),
    reportingFacility,
    source: syn?.source ?? "WHO_IDSR",
  };
}

/** Approve is the only way out of draft, and only for the Clinician or District role. */
export function approveEscalation(
  draft: EscalationDraft,
  role: string,
  now: string,
): EscalationDraft {
  if (role !== "clinician" && role !== "district") {
    throw new Error("Only a clinician or district surveillance officer can approve an escalation");
  }
  if (draft.status !== "draft") return draft;
  return { ...draft, status: "approved_queued", approvedBy: { role, at: now } };
}

export function canSend(draft: EscalationDraft): boolean {
  return draft.status === "approved_queued" && Boolean(draft.approvedBy);
}
