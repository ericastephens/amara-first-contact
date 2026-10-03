import { describe, expect, it } from "vitest";
import { facilitiesDoc, outbreakRows, rulesDoc } from "../src/data";
import {
  approveEscalation,
  canSend,
  clinicsToNotify,
  detectOutbreaks,
  draftEscalation,
  isoWeekOf,
  isoWeekStart,
  mergeCounts,
} from "../src/logic/outbreak";

const cfg = rulesDoc.outbreak;

describe("outbreak detection (EARS-style)", () => {
  it("flags fever_rash in Ondera in week 40 and nothing else", () => {
    const flags = detectOutbreaks(outbreakRows, cfg);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ ward: "Ondera", syndrome: "fever_rash", isoWeek: 40, count: 7 });
    expect(flags[0].threshold).toBeCloseTo(2.408, 3);
  });

  it("adds counts from synced encounters to the latest week", () => {
    const merged = mergeCounts(outbreakRows, [{ ward: "Kati", syndrome: "fever_rash", count: 5 }]);
    const flags = detectOutbreaks(merged, cfg);
    expect(flags.map((f) => f.ward).sort()).toEqual(["Kati", "Ondera"]);
  });

  it("sends the knowledge card to clinics within 25 km", () => {
    const clinics = clinicsToNotify(facilitiesDoc.facilities, "Ondera", cfg.share_radius_km);
    expect(clinics.length).toBeGreaterThan(0);
    expect(clinics.every((c) => c.km <= 25)).toBe(true);
  });

  it("ISO week helpers agree", () => {
    expect(isoWeekStart(2026, 40)).toBe("2026-09-28");
    expect(isoWeekOf("2026-10-05")).toEqual({ isoYear: 2026, isoWeek: 41 });
    expect(isoWeekOf("2026-09-28")).toEqual({ isoYear: 2026, isoWeek: 40 });
  });
});

describe("escalation needs human approval", () => {
  const flag = detectOutbreaks(outbreakRows, cfg)[0];
  const draft = draftEscalation(flag, cfg, "Zahanati ya Ondera", "2026-10-05T10:00:00Z")!;

  it("starts as a draft that cannot be sent", () => {
    expect(draft.status).toBe("draft");
    expect(draft.immediatelyNotifiable).toBe(true);
    expect(canSend(draft)).toBe(false);
  });

  it("a responder cannot approve", () => {
    expect(() => approveEscalation(draft, "responder", "2026-10-05T10:05:00Z")).toThrow();
  });

  it("a clinician or district officer can approve, then it is queued to send", () => {
    for (const role of ["clinician", "district"]) {
      const approved = approveEscalation(draft, role, "2026-10-05T10:05:00Z");
      expect(approved.status).toBe("approved_queued");
      expect(canSend(approved)).toBe(true);
    }
  });
});
