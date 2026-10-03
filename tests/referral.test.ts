import { describe, expect, it } from "vitest";
import { facilitiesDoc, slotsDoc, smsDoc } from "../src/data";
import {
  CODE_DIGITS,
  CODE_LETTERS,
  chooseReferral,
  codeSpoken,
  generateCode,
  haversineKm,
  pickSlot,
  suitableFacilities,
  walkingMinutes,
} from "../src/logic/referral";
import { englishTime, renderSms, renderVoice, swahiliTime, SMS_MAX } from "../src/logic/sms";

const from = facilitiesDoc.responder_sites[0];
const today = slotsDoc.demo_today;

describe("facility choice", () => {
  it("haversine distance is sensible", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
  });

  it("filters by level and sorts by distance", () => {
    const hc = suitableFacilities(facilitiesDoc.facilities, "health_centre", from);
    expect(hc.every((c) => ["health_centre", "hospital"].includes(c.facility.level))).toBe(true);
    for (let i = 1; i < hc.length; i++) expect(hc[i].km).toBeGreaterThanOrEqual(hc[i - 1].km);
    expect(hc[0].facility.id).toBe("F2");
    expect(suitableFacilities(facilitiesDoc.facilities, "hospital", from)[0].facility.id).toBe("F4");
  });

  it("walking time is estimated at 5 km/h", () => {
    expect(walkingMinutes(5)).toBe(60);
  });
});

describe("slots", () => {
  it("refer_today takes the earliest free slot today", () => {
    expect(pickSlot("refer_today", "F1", slotsDoc.slots, today)).toMatchObject({ date: today, time: "09:30" });
  });

  it("refer_routine takes the earliest free slot in the next 3 days", () => {
    expect(pickSlot("refer_routine", "F1", slotsDoc.slots, today)).toMatchObject({ date: "2026-10-06", time: "09:00" });
  });

  it("go_now ignores slots", () => {
    expect(pickSlot("go_now", "F4", slotsDoc.slots, today)).toBeNull();
    const r = chooseReferral("go_now", "hospital", facilitiesDoc.facilities, from, [], today, new Set());
    expect(r?.slot).toBeNull();
    expect(r?.choice.facility.level).toBe("hospital");
  });

  it("skips slots already reserved on this device and moves to the next facility when full", () => {
    const reserved = new Set(["F1|2026-10-05|09:30"]);
    const r = chooseReferral("refer_today", "dispensary", facilitiesDoc.facilities, from, slotsDoc.slots, today, reserved);
    expect(r?.choice.facility.id).not.toBe("F1");
    expect(r?.slot?.date).toBe(today);
  });
});

describe("referral code", () => {
  it("is 1 letter + 2 digits from an unambiguous alphabet", () => {
    const used = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const c = generateCode(used);
      expect(c).toMatch(/^[A-Z][2-9][2-9]$/);
      expect(c).not.toMatch(/[OI01]/);
      expect(used.has(c)).toBe(false);
      used.add(c);
    }
    expect(CODE_LETTERS).not.toMatch(/[OI]/);
    expect(CODE_DIGITS).not.toMatch(/[01]/);
  });

  it("is spoken digit by digit", () => {
    expect(codeSpoken("K47", "sw")).toBe("K, nne, saba");
    expect(codeSpoken("K47", "en")).toBe("K, four, seven");
  });
});

describe("SMS", () => {
  it("converts to Swahili time", () => {
    expect(swahiliTime("09:00")).toBe("saa 3 asubuhi");
    expect(swahiliTime("14:00")).toBe("saa 8 mchana");
    expect(swahiliTime("09:30")).toBe("saa 3 na nusu asubuhi");
    expect(englishTime("14:00")).toBe("2:00 pm");
  });

  it("renders a referral SMS in Swahili within 160 characters", () => {
    const text = renderSms(smsDoc, "referral", "sw", { name: "Noor", clinic: "Zahanati ya Ondera", date: today, time: "09:30", code: "K47" });
    expect(text).toBe("Habari Noor. Nenda Zahanati ya Ondera Jumatatu saa 3 na nusu asubuhi. Namba yako: K47. Onyesha namba hii ukifika. Ukishindwa kwenda, jibu 2.");
    expect(text.length).toBeLessThanOrEqual(SMS_MAX);
  });

  it("never exceeds 160 characters, for every facility, slot, language and template", () => {
    for (const s of slotsDoc.slots) {
      const f = facilitiesDoc.facilities.find((x) => x.id === s.facility_id)!;
      for (const lang of ["sw", "en"] as const) {
        for (const t of ["referral", "go_now", "slot_confirmed", "slot_moved", "did_you_go", "followup_reminder"]) {
          const text = renderSms(smsDoc, t, lang, {
            name: "Mwanaidi Abdallah Mkwawa",
            clinic: lang === "sw" ? f.name : f.name_en ?? f.name,
            date: s.date,
            time: s.time,
            code: "K47",
          });
          expect(text.length, text).toBeLessThanOrEqual(SMS_MAX);
        }
      }
    }
  });

  it("renders a voice script with the code spoken", () => {
    const v = renderVoice(smsDoc, "referral", "sw", { name: "Noor", clinic: "Zahanati ya Ondera", date: today, time: "09:30", code: "K47", responder: "Duka la Dawa Ondera" });
    expect(v).toContain("K, nne, saba");
  });
});
