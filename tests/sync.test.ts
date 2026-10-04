import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { icd10, rulesDoc, testCases } from "../src/data";
import { encounterFromCase } from "../src/logic/encounter";
import { evaluate } from "../src/logic/rules";
import { db, resetLocalDb } from "../src/storage/db";
import { listCaseCounts, listClinicReferrals, listGatewaySms, resetServer } from "../src/sync/mockServer";
import { setSimulatedNetwork } from "../src/sync/network";
import { backoffMs, flush, queuedCount } from "../src/sync/sync";
import { createReferral, planReferral } from "../src/services/referrals";

const NOW = "2026-10-05T09:00:00.000Z";

async function makeReferral(caseId: string, patch: Partial<ReturnType<typeof encounterFromCase>> = {}) {
  const c = testCases.cases.find((x) => x.id === caseId)!;
  const enc = { ...encounterFromCase(c.id, c.encounter, NOW, `enc-${caseId}`, "Noor"), ...patch };
  const result = evaluate(rulesDoc, icd10, c.encounter);
  const plan = (await planReferral(result, "2026-10-05"))!;
  const decisions = result.fired.map((f) => ({ ruleId: f.id, decision: "confirm" as const }));
  return createReferral(enc, result, decisions, plan, NOW);
}

beforeEach(async () => {
  setSimulatedNetwork(true);
  await resetLocalDb();
  await resetServer();
});

describe("no phone: national ID instead", () => {
  it("sends no SMS or call, and passes the ID to the clinic, not to the district counts", async () => {
    const nida = "19850315-12345-00001-23";
    const { referral, messages } = await makeReferral("child_diarrhoea", { phone: "", noPhone: true, nationalId: nida });
    expect(messages).toHaveLength(0);
    expect(referral.nationalId).toBe(nida);
    expect(referral.note).toContain("no phone (paper slip given)");
    expect(referral.note).not.toContain(nida); // the note shows only the last digits
    await flush(NOW);
    expect(await listGatewaySms()).toHaveLength(0);
    expect(JSON.stringify(await listCaseCounts())).not.toContain("19850315");
  });
});

describe("store-and-forward sync", () => {
  it("keeps referrals and SMS queued while offline, then flushes them when online", async () => {
    setSimulatedNetwork(false);
    const { referral } = await makeReferral("child_diarrhoea");
    expect(referral.slotStatus).toBe("provisional");
    expect(await queuedCount()).toBeGreaterThan(0);
    expect(await flush(NOW)).toBe(0);
    expect(await listClinicReferrals()).toHaveLength(0);

    setSimulatedNetwork(true);
    const sent = await flush(NOW);
    expect(sent).toBeGreaterThan(0);
    expect(await queuedCount()).toBe(0);
    const clinic = await listClinicReferrals();
    expect(clinic).toHaveLength(1);
    expect(clinic[0].code).toBe(referral.code);
    expect(clinic[0].slotStatus).toBe("confirmed");
    expect((await listGatewaySms()).some((m) => m.referralId === referral.id && m.status === "sent")).toBe(true);
  });

  it("sends anonymous counts (no names or phone numbers) for outbreak detection", async () => {
    await makeReferral("demo_3");
    await flush(NOW);
    const counts = await listCaseCounts();
    expect(counts).toEqual([expect.objectContaining({ ward: "Ondera", syndrome: "fever_rash", count: 1 })]);
    expect(JSON.stringify(counts)).not.toContain("Noor");
    expect(JSON.stringify(counts)).not.toContain("+255");
  });

  it("moves the slot when another responder already took it and sends a 'slot moved' SMS", async () => {
    const { referral } = await makeReferral("demo_1"); // health centre F2, earliest slot 08:00 is taken on the server
    expect(referral.slot).toEqual({ date: "2026-10-05", time: "08:00" });
    await flush(NOW);
    const clinic = (await listClinicReferrals())[0];
    expect(clinic.slotStatus).toBe("moved");
    expect(clinic.slot).toEqual({ date: "2026-10-05", time: "08:30" });
    const sms = await listGatewaySms();
    expect(sms.some((m) => m.templateId === "slot_moved")).toBe(true);
    expect(sms.some((m) => m.templateId === "referral")).toBe(false);
  });

  it("nothing is lost: the outbox is persistent IndexedDB", async () => {
    setSimulatedNetwork(false);
    const { referral } = await makeReferral("demo_2");
    const stored = await (await db()).get("referrals_outbox", referral.id);
    expect(stored?.status).toBe("queued");
  });

  it("backs off exponentially", () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(20)).toBe(60000);
  });
});
