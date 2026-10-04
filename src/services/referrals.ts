// Creates the referral on the device: facility, provisional slot, code, note, SMS/voice, case counts.
// Everything is written to the outbox; sync sends it when the network is available.
import { facilitiesDoc, intentLabels, questionnaires, rulesDoc, slotsDoc, smsDoc } from "../data";
import type { Encounter } from "../logic/encounter";
import { buildNote } from "../logic/note";
import { isoWeekOf, latestWeek } from "../logic/outbreak";
import { outbreakRows } from "../data";
import { chooseReferral, generateCode, slotKey, type FacilityChoice } from "../logic/referral";
import type { FlagDecision, RulesResult } from "../logic/rules";
import { renderSms, renderVoice } from "../logic/sms";
import { urgencyLabel } from "../logic/views";
import { db, getMeta, setMeta, uid, type Referral, type SmsMessage } from "../storage/db";
import { notify } from "../sync/sync";

export interface ReferralPlan {
  choice: FacilityChoice;
  slot: { date: string; time: string } | null;
}

export async function reservedSlots(): Promise<Set<string>> {
  return new Set(await getMeta<string[]>("reservedSlots", []));
}

export async function usedCodes(): Promise<Set<string>> {
  return new Set(await getMeta<string[]>("usedCodes", []));
}

/** `nowTime` ("HH:MM", local demo clock): slots earlier today are skipped. */
export async function planReferral(result: RulesResult, today: string, nowTime?: string): Promise<ReferralPlan | null> {
  if (!result.facilityLevel || result.urgency === "home_care_followup") return null;
  const from = facilitiesDoc.responder_sites[0];
  const r = chooseReferral(
    result.urgency,
    result.facilityLevel,
    facilitiesDoc.facilities,
    from,
    slotsDoc.slots,
    today,
    await reservedSlots(),
    nowTime,
  );
  if (!r) return null;
  return { choice: r.choice, slot: r.slot ? { date: r.slot.date, time: r.slot.time } : null };
}

export function messageLang(enc: Encounter): "sw" | "en" {
  return enc.answers.q_language === "en" ? "en" : "sw";
}

export function messageChannel(enc: Encounter): "sms" | "voice" {
  return enc.answers.q_reader === "prefers_voice" || enc.answers.q_phone === "no_phone" ? "voice" : "sms";
}

export interface CreatedReferral {
  referral: Referral;
  messages: SmsMessage[];
}

export async function createReferral(
  enc: Encounter,
  result: RulesResult,
  decisions: FlagDecision[],
  plan: ReferralPlan,
  nowIso: string,
): Promise<CreatedReferral> {
  const d = await db();
  const used = await usedCodes();
  const code = generateCode(used);
  await setMeta("usedCodes", [...used, code]);
  if (plan.slot) {
    const reserved = await reservedSlots();
    reserved.add(slotKey({ facility_id: plan.choice.facility.id, ...plan.slot }));
    await setMeta("reservedSlots", [...reserved]);
  }

  const fac = plan.choice.facility;
  const lang = messageLang(enc);
  const channel = messageChannel(enc);
  const responder = facilitiesDoc.responder_sites[0].name;
  const note = buildNote(enc, result, decisions, {
    questionnaires,
    labels: intentLabels,
    urgencyLabel: urgencyLabel(rulesDoc, result.urgency, "en"),
    referral: { clinic: fac.name_en ?? fac.name, date: plan.slot?.date, time: plan.slot?.time, code, provisional: true },
    responder,
  });

  const syndromes = [...new Set(result.fired.flatMap((f) => (f.syndrome ? [f.syndrome] : [])))];
  const referral: Referral = {
    id: uid("ref"),
    code,
    encounterId: enc.id,
    createdAt: nowIso,
    urgency: result.urgency,
    facilityId: fac.id,
    facilityName: fac.name,
    facilityNameEn: fac.name_en ?? fac.name,
    km: plan.choice.km,
    walkMinutes: plan.choice.walkMinutes,
    slot: plan.slot,
    slotStatus: plan.slot ? "provisional" : "none",
    status: "queued",
    note,
    reasons: result.fired.map((f) => ({ ruleId: f.id, en: f.reason.en, sw: f.reason.sw, source: f.sourceTitle })),
    ruleOut: result.ruleOut.map((r) => ({ code: r.code, title: r.title })),
    decisions,
    syndromes,
    ward: enc.wardOfResidence,
    group: enc.group,
    lang,
    channel,
    patientName: enc.patientName,
    phone: enc.phone,
    attempts: 0,
    nextAttemptAt: 0,
  };

  const messages: SmsMessage[] = [];
  if (enc.answers.q_consent === "yes") {
    const input = {
      name: enc.patientName,
      clinic: lang === "sw" ? fac.name : fac.name_en ?? fac.name,
      date: plan.slot?.date,
      time: plan.slot?.time,
      code,
    };
    const templateId = result.urgency === "go_now" || !plan.slot ? "go_now" : "referral";
    const text =
      channel === "voice" && templateId === "referral"
        ? renderVoice(smsDoc, "referral", lang, { ...input, responder })
        : renderSms(smsDoc, templateId, lang, input);
    messages.push({
      id: uid("sms"),
      referralId: referral.id,
      to: enc.phone,
      lang,
      channel,
      templateId,
      text,
      status: "queued",
      createdAt: nowIso,
      attempts: 0,
      nextAttemptAt: 0,
    });
  }

  const tx = d.transaction(["referrals_outbox", "sms_outbox", "outbreak_counts", "encounters"], "readwrite");
  await tx.objectStore("referrals_outbox").put(referral);
  for (const m of messages) await tx.objectStore("sms_outbox").put(m);
  // Anonymous counts for outbreak detection: added to the current reporting week.
  const week = reportingWeek(nowIso);
  for (const syndrome of syndromes) {
    const id = `${enc.wardOfResidence}|${syndrome}|${week.isoYear}|${week.isoWeek}`;
    const prev = await tx.objectStore("outbreak_counts").get(id);
    await tx.objectStore("outbreak_counts").put({
      id,
      ward: enc.wardOfResidence,
      syndrome,
      isoYear: week.isoYear,
      isoWeek: week.isoWeek,
      count: (prev?.count ?? 0) + 1,
    });
  }
  await tx.objectStore("encounters").put({ ...enc, updatedAt: nowIso });
  await tx.done;
  await notify();
  return { referral, messages };
}

/**
 * The reporting week used for counts. The sample CSV runs to week 40, and demo "today" falls in week 41,
 * so demo encounters are added to the latest week in the CSV; after that, the real ISO week.
 */
export function reportingWeek(nowIso: string): { isoYear: number; isoWeek: number } {
  const latest = latestWeek(outbreakRows);
  const now = isoWeekOf(nowIso.slice(0, 10));
  return now.isoYear * 100 + now.isoWeek <= latest.isoYear * 100 + latest.isoWeek + 1 ? latest : now;
}
