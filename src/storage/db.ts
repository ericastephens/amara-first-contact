// On-device storage (IndexedDB). Patient data stays here until synced.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Encounter } from "../logic/encounter";
import type { FlagDecision, RulesResult } from "../logic/rules";
import type { EscalationDraft } from "../logic/outbreak";
import type { Urgency } from "../data/schemas";

export interface Patient {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
}

export interface Referral {
  id: string;
  code: string;
  encounterId: string;
  createdAt: string;
  urgency: Urgency;
  facilityId: string;
  facilityName: string;
  facilityNameEn: string;
  km: number;
  walkMinutes: number;
  slot: { date: string; time: string } | null;
  slotStatus: "none" | "provisional" | "confirmed" | "moved";
  status: "queued" | "sent";
  note: string;
  /** Reason text per language code (en and sw always; more when rules.json has them). */
  reasons: ({ ruleId: string; en: string; sw: string; source: string } & Record<string, string>)[];
  ruleOut: { code: string; title: string }[];
  decisions: FlagDecision[];
  syndromes: string[];
  ward: string;
  group: string;
  lang: string;
  channel: "sms" | "voice";
  patientName: string;
  phone: string;
  /** Work ID of the professional who made the referral (from setup). */
  responderWorkId?: string;
  /** True when the clinic is a real facility from OpenStreetMap, false/absent for sample clinics. */
  facilityReal?: boolean;
  attempts: number;
  nextAttemptAt: number;
  sentAt?: string;
}

export interface SmsMessage {
  id: string;
  referralId: string;
  to: string;
  lang: string;
  channel: "sms" | "voice";
  templateId: string;
  text: string;
  status: "queued" | "sent";
  createdAt: string;
  sentAt?: string;
  scheduledFor?: string;
  attempts: number;
  nextAttemptAt: number;
}

export interface OutbreakCount {
  id: string; // ward|syndrome|year|week
  ward: string;
  syndrome: string;
  isoYear: number;
  isoWeek: number;
  count: number;
}

export interface SavedResult {
  encounterId: string;
  result: RulesResult;
  decisions: FlagDecision[];
}

interface AmaraDB extends DBSchema {
  patients: { key: string; value: Patient };
  encounters: { key: string; value: Encounter };
  results: { key: string; value: SavedResult };
  referrals_outbox: { key: string; value: Referral; indexes: { by_status: string } };
  sms_outbox: { key: string; value: SmsMessage; indexes: { by_status: string } };
  outbreak_counts: { key: string; value: OutbreakCount };
  escalations: { key: string; value: EscalationDraft };
  meta: { key: string; value: unknown };
}

export const DB_NAME = "amara";
let dbPromise: Promise<IDBPDatabase<AmaraDB>> | null = null;

export function db(): Promise<IDBPDatabase<AmaraDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AmaraDB>(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore("patients", { keyPath: "id" });
        d.createObjectStore("encounters", { keyPath: "id" });
        d.createObjectStore("results", { keyPath: "encounterId" });
        d.createObjectStore("referrals_outbox", { keyPath: "id" }).createIndex("by_status", "status");
        d.createObjectStore("sms_outbox", { keyPath: "id" }).createIndex("by_status", "status");
        d.createObjectStore("outbreak_counts", { keyPath: "id" });
        d.createObjectStore("escalations", { keyPath: "id" });
        d.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

/** For tests and the "Reset demo" button. */
export async function resetLocalDb(): Promise<void> {
  const d = await db();
  const tx = d.transaction(
    ["patients", "encounters", "results", "referrals_outbox", "sms_outbox", "outbreak_counts", "escalations", "meta"],
    "readwrite",
  );
  await Promise.all([...tx.objectStoreNames].map((n) => tx.objectStore(n).clear()));
  await tx.done;
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const v = (await (await db()).get("meta", key)) as T | undefined;
  return v === undefined ? fallback : v;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put("meta", value, key);
}

export function uid(prefix: string): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2);
  return `${prefix}-${rnd}`;
}
