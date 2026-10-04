import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { facilitiesDoc, icd10, intentLabels, outbreakRows, rulesDoc, slotsDoc, smsDoc, testCases } from "../src/data";
import { encounterFromCase } from "../src/logic/encounter";
import { detectOutbreaks, draftEscalation } from "../src/logic/outbreak";
import { evaluate } from "../src/logic/rules";
import { normaliseForCheck, renderSms, renderVoice } from "../src/logic/sms";
import { DRAFT_LABEL, clinicianView, motherView, responderView } from "../src/logic/views";
import { db, resetLocalDb } from "../src/storage/db";
import { listServerEscalations, resetServer } from "../src/sync/mockServer";
import { setSimulatedNetwork } from "../src/sync/network";
import { flush } from "../src/sync/sync";
import { createReferral, planReferral } from "../src/services/referrals";

// Banned words: every symptom label (en + sw) and every ICD-10 title.
const banned = [
  ...intentLabels.labels.filter((l) => l.id !== "other").flatMap((l) => [l.en, l.sw]),
  ...icd10.codes.map((c) => c.title),
  // single symptom words that would leak a symptom even without the full label
  "homa", "fever", "damu", "bleeding", "degedege", "malaria", "measles", "surua", "pregnan", "mimba",
].map((w) => normaliseForCheck(w).trim());

function assertClean(text: string) {
  const norm = normaliseForCheck(text);
  for (const b of banned) expect(norm.includes(` ${b}`), `"${text}" contains "${b}"`).toBe(false);
}

beforeEach(async () => {
  setSimulatedNetwork(true);
  await resetLocalDb();
  await resetServer();
});

describe("SMS and voice never contain a symptom or diagnosis", () => {
  it("every SMS template and voice script, filled, is clean", () => {
    const f = facilitiesDoc.facilities[3];
    for (const lang of ["sw", "en"] as const) {
      for (const t of ["referral", "go_now", "slot_confirmed", "slot_moved", "did_you_go", "followup_reminder"]) {
        assertClean(renderSms(smsDoc, t, lang, { name: "Noor", clinic: lang === "sw" ? f.name : f.name_en!, date: slotsDoc.demo_today, time: "14:00", code: "K47" }));
      }
      for (const v of ["referral", "did_you_go"]) {
        assertClean(renderVoice(smsDoc, v, lang, { name: "Noor", clinic: f.name, date: slotsDoc.demo_today, time: "14:00", code: "K47", responder: "Duka la Dawa Ondera" }));
      }
    }
  });

  it("messages created for every golden case are clean and <= 160 characters", async () => {
    for (const c of testCases.cases) {
      const result = evaluate(rulesDoc, icd10, c.encounter);
      const plan = await planReferral(result, slotsDoc.demo_today);
      if (!plan) continue;
      const enc = encounterFromCase(c.id, c.encounter, "2026-10-05T09:00:00Z", `enc-${c.id}`, "Noor");
      const { messages } = await createReferral(enc, result, [], plan, "2026-10-05T09:00:00Z");
      for (const m of messages) {
        assertClean(m.text);
        if (m.channel === "sms") expect(m.text.length).toBeLessThanOrEqual(160);
      }
    }
  });
});

describe("views", () => {
  it("Mother view never shows rule-outs, codes or reasons; clinician sees drafts", () => {
    for (const c of testCases.cases) {
      const r = evaluate(rulesDoc, icd10, c.encounter);
      const mv = JSON.stringify(motherView(rulesDoc, r, { clinic: "X", code: "K47", provisional: true }, "en"));
      expect(mv).not.toMatch(/rule|ICD|Draft/i);
      for (const ro of r.ruleOut) expect(mv).not.toContain(ro.code);
      const rv = JSON.stringify(responderView(rulesDoc, r, "en"));
      for (const ro of r.ruleOut) expect(rv).not.toContain(ro.title);
      const cv = clinicianView(rulesDoc, r, "en");
      expect(cv.ruleOut.every((x) => x.label === DRAFT_LABEL)).toBe(true);
    }
  });
});

describe("urgent never waits for tech", () => {
  it("go_now works with the network off and no slots at all", async () => {
    setSimulatedNetwork(false);
    const c = testCases.cases.find((x) => x.id === "preg_bleeding")!;
    const result = evaluate(rulesDoc, icd10, c.encounter);
    expect(result.urgency).toBe("go_now");
    const plan = (await planReferral(result, "2030-01-01"))!; // a day with no slots
    expect(plan.slot).toBeNull();
    expect(plan.choice.facility.level).toBe("hospital");
    const enc = encounterFromCase(c.id, c.encounter, "2026-10-05T09:00:00Z", "enc-x", "Noor");
    const { referral, messages } = await createReferral(enc, result, [], plan, "2026-10-05T09:00:00Z");
    expect(referral.code).toMatch(/^[A-Z][2-9]{2}$/);
    expect(messages[0].templateId).toBe("go_now");
  });
});

describe("escalation cannot be sent without Approve", () => {
  it("a draft stays on the device when syncing", async () => {
    const flag = detectOutbreaks(outbreakRows, rulesDoc.outbreak)[0];
    const draft = draftEscalation(flag, rulesDoc.outbreak, "Zahanati ya Ondera", "2026-10-05T09:00:00Z")!;
    await (await db()).put("escalations", draft);
    await flush("2026-10-05T09:00:00Z");
    expect(await listServerEscalations()).toHaveLength(0);
    expect((await (await db()).get("escalations", draft.id))?.status).toBe("draft");
  });

  it("an approved escalation is sent on sync", async () => {
    const flag = detectOutbreaks(outbreakRows, rulesDoc.outbreak)[0];
    const draft = draftEscalation(flag, rulesDoc.outbreak, "Zahanati ya Ondera", "2026-10-05T09:00:00Z")!;
    await (await db()).put("escalations", { ...draft, status: "approved_queued", approvedBy: { role: "district", at: "2026-10-05T09:01:00Z", workId: "DSO-KLM-07" } });
    await flush("2026-10-05T09:02:00Z");
    expect(await listServerEscalations()).toHaveLength(1);
  });
});
