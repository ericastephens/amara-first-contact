// In-browser stand-in for the clinic and district servers (separate IndexedDB database).
// There is no real backend in the demo. Every call fails while the network is off, like a real request would.
import { activeSlots } from "../facilities/registry";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { facilitiesDoc, slotsDoc } from "../data";
import { pickSlot, slotKey } from "../logic/referral";
import type { EscalationDraft } from "../logic/outbreak";
import type { Referral, SmsMessage } from "../storage/db";
import { isOnline } from "./network";

export interface ClinicReferral extends Referral {
  receivedAt: string;
  arrival: "expected" | "arrived" | "not_arrived";
  arrivedAt?: string;
  reminderQueuedAt?: string;
  confirmedCodes?: string[];
}

export interface CaseCount {
  id: string;
  ward: string;
  syndrome: string;
  isoYear: number;
  isoWeek: number;
  count: number;
}

export interface SiteSync {
  siteId: string;
  siteName: string;
  ward: string;
  lastSynced: string;
  synthetic: boolean;
}

interface ServerDB extends DBSchema {
  referrals: { key: string; value: ClinicReferral };
  taken_slots: { key: string; value: { key: string; by: string } };
  sms_gateway: { key: string; value: SmsMessage & { deliveredAt: string } };
  escalations: { key: string; value: EscalationDraft & { receivedAt: string } };
  case_counts: { key: string; value: CaseCount };
  site_sync: { key: string; value: SiteSync };
}

export const SERVER_DB_NAME = "amara-mock-server";
let serverPromise: Promise<IDBPDatabase<ServerDB>> | null = null;

function server(): Promise<IDBPDatabase<ServerDB>> {
  if (!serverPromise) {
    serverPromise = openDB<ServerDB>(SERVER_DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore("referrals", { keyPath: "id" });
        d.createObjectStore("taken_slots", { keyPath: "key" });
        d.createObjectStore("sms_gateway", { keyPath: "id" });
        d.createObjectStore("escalations", { keyPath: "id" });
        d.createObjectStore("case_counts", { keyPath: "id" });
        d.createObjectStore("site_sync", { keyPath: "siteId" });
      },
    });
  }
  return serverPromise;
}

/**
 * Seed state that represents the rest of the (simulated) network:
 * one slot already taken by another responder, so "slot moved" can be shown, and
 * last-synced times for the other reporting sites (Sample data).
 */
export async function seedServer(): Promise<void> {
  const s = await server();
  if ((await s.count("site_sync")) > 0) return;
  await s.put("taken_slots", { key: `F2|${slotsDoc.demo_today}|08:00`, by: "another-responder" });
  const day = slotsDoc.demo_today;
  const prev = new Date(`${day}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const yesterday = prev.toISOString().slice(0, 10);
  const times = ["07:40", "18:05", "16:20", "12:10", "19:30"];
  for (const [i, f] of facilitiesDoc.facilities.entries()) {
    await s.put("site_sync", {
      siteId: f.id,
      siteName: f.name,
      ward: f.ward,
      lastSynced: `${i === 2 ? "2026-10-01" : yesterday}T${times[i % times.length]}:00`,
      synthetic: true,
    });
  }
}

export async function resetServer(): Promise<void> {
  const s = await server();
  const tx = s.transaction(["referrals", "taken_slots", "sms_gateway", "escalations", "case_counts", "site_sync"], "readwrite");
  await Promise.all([...tx.objectStoreNames].map((n) => tx.objectStore(n).clear()));
  await tx.done;
  await seedServer();
}

function requireNetwork(): void {
  if (!isOnline()) throw new Error("offline");
}

export interface ReceiveResult {
  slot: { date: string; time: string } | null;
  slotStatus: "none" | "confirmed" | "moved";
}

/** Clinic receives a referral: confirm its slot, or move it to the next free slot if someone took it. */
export async function receiveReferral(ref: Referral, now: string): Promise<ReceiveResult> {
  requireNetwork();
  const s = await server();
  const existing = await s.get("referrals", ref.id);
  if (existing) return { slot: existing.slot, slotStatus: existing.slotStatus === "moved" ? "moved" : existing.slot ? "confirmed" : "none" };

  let slot = ref.slot;
  let slotStatus: ReceiveResult["slotStatus"] = slot ? "confirmed" : "none";
  if (slot) {
    const taken = new Set((await s.getAll("taken_slots")).map((t) => t.key));
    if (taken.has(slotKey({ facility_id: ref.facilityId, ...slot }))) {
      const next = pickSlot(ref.urgency, ref.facilityId, activeSlots(), slot.date, taken, { facility_id: ref.facilityId, status: "free", ...slot });
      slot = next ? { date: next.date, time: next.time } : null;
      slotStatus = "moved";
    }
    if (slot) await s.put("taken_slots", { key: slotKey({ facility_id: ref.facilityId, ...slot }), by: ref.id });
  }
  await s.put("referrals", { ...ref, slot, slotStatus, status: "sent", receivedAt: now, arrival: "expected" });
  return { slot, slotStatus };
}

export async function deliverSms(msg: SmsMessage, now: string): Promise<void> {
  requireNetwork();
  await (await server()).put("sms_gateway", { ...msg, status: "sent", sentAt: now, deliveredAt: now });
}

/** Anonymous counts only: ward, syndrome, week, count. No names, no phone numbers. */
export async function receiveCaseCounts(counts: Omit<CaseCount, "id">[]): Promise<void> {
  requireNetwork();
  const s = await server();
  for (const c of counts) {
    const id = `${c.ward}|${c.syndrome}|${c.isoYear}|${c.isoWeek}`;
    const prev = await s.get("case_counts", id);
    await s.put("case_counts", { ...c, id, count: (prev?.count ?? 0) + c.count });
  }
}

export async function receiveEscalation(e: EscalationDraft, now: string): Promise<void> {
  requireNetwork();
  if (e.status !== "approved_queued" || !e.approvedBy) throw new Error("Escalation not approved");
  await (await server()).put("escalations", { ...e, status: "sent", sentAt: now, receivedAt: now });
}

export async function recordSiteSync(siteId: string, siteName: string, ward: string, now: string): Promise<void> {
  requireNetwork();
  await (await server()).put("site_sync", { siteId, siteName, ward, lastSynced: now, synthetic: false });
}

// ---- reads used by the Clinician and District dashboards (the dashboards run "on the server")

export async function listClinicReferrals(): Promise<ClinicReferral[]> {
  return (await (await server()).getAll("referrals")).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function updateClinicReferral(id: string, patch: Partial<ClinicReferral>): Promise<void> {
  const s = await server();
  const r = await s.get("referrals", id);
  if (r) await s.put("referrals", { ...r, ...patch });
}

export async function listCaseCounts(): Promise<CaseCount[]> {
  return (await server()).getAll("case_counts");
}

export async function listSiteSync(): Promise<SiteSync[]> {
  return (await server()).getAll("site_sync");
}

export async function listGatewaySms(): Promise<(SmsMessage & { deliveredAt: string })[]> {
  return (await server()).getAll("sms_gateway");
}

export async function listServerEscalations(): Promise<EscalationDraft[]> {
  return (await server()).getAll("escalations");
}

/** Clinic-side: referrals not arrived 48 h after the referral get an evening reminder (SMS or voice). */
export async function markNotArrived(now: Date, makeReminder: (r: ClinicReferral) => SmsMessage): Promise<number> {
  const s = await server();
  let n = 0;
  for (const r of await s.getAll("referrals")) {
    if (r.arrival !== "expected") continue;
    if (now.getTime() - new Date(r.createdAt).getTime() < 48 * 3600_000) continue;
    const reminder = makeReminder(r);
    await s.put("sms_gateway", { ...reminder, status: "queued", deliveredAt: "" });
    await s.put("referrals", { ...r, arrival: "not_arrived", reminderQueuedAt: now.toISOString() });
    n++;
  }
  return n;
}
