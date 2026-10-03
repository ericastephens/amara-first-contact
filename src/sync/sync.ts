// Store-and-forward: referrals, SMS, anonymous case counts and approved escalations wait in the
// on-device outbox while offline and are flushed to the (mock) server when the network is back.
// Failed items retry with exponential backoff; nothing is lost on reload because the outbox is IndexedDB.
import { facilitiesDoc, smsDoc } from "../data";
import { renderSms } from "../logic/sms";
import { canSend } from "../logic/outbreak";
import { db, getMeta, setMeta, uid, type SmsMessage } from "../storage/db";
import { deliverSms, receiveCaseCounts, receiveEscalation, receiveReferral, recordSiteSync } from "./mockServer";
import { isOnline, onNetworkChange } from "./network";

export interface SyncStatus {
  online: boolean;
  queued: number;
  lastSynced: string | null;
  syncing: boolean;
}

type Listener = (s: SyncStatus) => void;
const listeners = new Set<Listener>();
let syncing = false;

export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_MAX_MS = 60_000;

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
}

export async function queuedCount(): Promise<number> {
  const d = await db();
  const [refs, sms, esc, counts] = await Promise.all([
    d.countFromIndex("referrals_outbox", "by_status", "queued"),
    d.countFromIndex("sms_outbox", "by_status", "queued"),
    d.getAll("escalations"),
    d.count("outbreak_counts"),
  ]);
  return refs + sms + esc.filter((e) => e.status === "approved_queued").length + counts;
}

export async function getStatus(): Promise<SyncStatus> {
  return {
    online: isOnline(),
    queued: await queuedCount(),
    lastSynced: await getMeta<string | null>("lastSynced", null),
    syncing,
  };
}

export async function notify(): Promise<void> {
  const s = await getStatus();
  listeners.forEach((l) => l(s));
}

export function onSyncStatus(l: Listener): () => void {
  listeners.add(l);
  void getStatus().then(l);
  return () => listeners.delete(l);
}

function due(item: { nextAttemptAt: number }, nowMs: number): boolean {
  return item.nextAttemptAt <= nowMs;
}

/** Flush everything that is due. Returns the number of items sent. */
export async function flush(nowIso: string, nowMs: number = Date.now()): Promise<number> {
  if (!isOnline() || syncing) return 0;
  syncing = true;
  let sent = 0;
  let failed = false;
  try {
    const d = await db();

    // 1. referrals → clinic. Slot is confirmed, or moved if another responder took it.
    for (const ref of await d.getAllFromIndex("referrals_outbox", "by_status", "queued")) {
      if (!due(ref, nowMs)) continue;
      try {
        const res = await receiveReferral(ref, nowIso);
        const moved = res.slotStatus === "moved";
        await d.put("referrals_outbox", {
          ...ref,
          status: "sent",
          sentAt: nowIso,
          slot: res.slot,
          slotStatus: res.slotStatus,
          attempts: ref.attempts + 1,
        });
        if (moved && res.slot) {
          const fac = facilitiesDoc.facilities.find((f) => f.id === ref.facilityId);
          const msg: SmsMessage = {
            id: uid("sms"),
            referralId: ref.id,
            to: ref.phone,
            lang: ref.lang,
            channel: ref.channel,
            templateId: "slot_moved",
            text: renderSms(smsDoc, "slot_moved", ref.lang, {
              name: ref.patientName,
              clinic: ref.lang === "sw" ? fac?.name ?? ref.facilityName : fac?.name_en ?? ref.facilityNameEn,
              date: res.slot.date,
              time: res.slot.time,
              code: ref.code,
            }),
            status: "queued",
            createdAt: nowIso,
            attempts: 0,
            nextAttemptAt: 0,
          };
          // the original SMS has the old time: replace it if it is still queued
          for (const old of await d.getAllFromIndex("sms_outbox", "by_status", "queued")) {
            if (old.referralId === ref.id && old.templateId === "referral") await d.delete("sms_outbox", old.id);
          }
          await d.put("sms_outbox", msg);
        }
        sent++;
      } catch {
        failed = true;
        await d.put("referrals_outbox", { ...ref, attempts: ref.attempts + 1, nextAttemptAt: nowMs + backoffMs(ref.attempts + 1) });
      }
    }

    // 2. SMS / voice → gateway
    for (const msg of await d.getAllFromIndex("sms_outbox", "by_status", "queued")) {
      if (!due(msg, nowMs)) continue;
      try {
        await deliverSms(msg, nowIso);
        await d.put("sms_outbox", { ...msg, status: "sent", sentAt: nowIso, attempts: msg.attempts + 1 });
        sent++;
      } catch {
        failed = true;
        await d.put("sms_outbox", { ...msg, attempts: msg.attempts + 1, nextAttemptAt: nowMs + backoffMs(msg.attempts + 1) });
      }
    }

    // 3. anonymous case counts → district
    const counts = await d.getAll("outbreak_counts");
    if (counts.length) {
      try {
        await receiveCaseCounts(counts.map(({ ward, syndrome, isoYear, isoWeek, count }) => ({ ward, syndrome, isoYear, isoWeek, count })));
        await d.clear("outbreak_counts");
        sent += counts.length;
      } catch {
        failed = true;
      }
    }

    // 4. approved escalations → district surveillance officer (drafts never leave the device)
    for (const e of await d.getAll("escalations")) {
      if (!canSend(e)) continue;
      try {
        await receiveEscalation(e, nowIso);
        await d.put("escalations", { ...e, status: "sent", sentAt: nowIso });
        sent++;
      } catch {
        failed = true;
      }
    }

    if (!failed) {
      const site = facilitiesDoc.responder_sites[0];
      try {
        await recordSiteSync(site.id, site.name, site.ward, nowIso);
        await setMeta("lastSynced", nowIso);
      } catch {
        // went offline mid-sync; next round will retry
      }
    }
  } finally {
    syncing = false;
    await notify();
  }
  return sent;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the background sync loop (every 3 s while online, and right away when the network comes back). */
export function startSyncLoop(nowIso: () => string): () => void {
  const tick = () => void flush(nowIso()).catch(() => undefined);
  const off = onNetworkChange(() => {
    void notify();
    tick();
  });
  timer = setInterval(tick, 3000);
  tick();
  return () => {
    off();
    if (timer) clearInterval(timer);
  };
}
