import { describe, expect, it } from "vitest";
import { facilitiesFromOsm, levelFromOsm, simulatedSlots, type OsmElement } from "../src/facilities/registry";
import { chooseReferral } from "../src/logic/referral";

// Shape of an Overpass API "out center tags" response (values invented for the test).
const elements: OsmElement[] = [
  { type: "node", id: 1, lat: -3.3, lon: 37.3, tags: { amenity: "clinic", name: "Zahanati ya Mfano" } },
  { type: "way", id: 2, center: { lat: -3.32, lon: 37.33 }, tags: { amenity: "hospital", name: "Hospitali ya Mfano" } },
  { type: "node", id: 3, lat: -3.31, lon: 37.31, tags: { amenity: "clinic", name: "Kituo cha Afya Mfano" } },
  { type: "node", id: 4, lat: -3.305, lon: 37.305, tags: { amenity: "pharmacy", name: "Duka la Dawa Mfano" } },
  { type: "node", id: 5, lat: -3.2, lon: 37.2, tags: { amenity: "clinic" } },
  { type: "node", id: 6, lat: -3.3, lon: 37.3, tags: { amenity: "clinic", name: "Zahanati ya Mfano" } },
];

describe("OpenStreetMap facilities", () => {
  it("maps Tanzanian names and OSM tags to facility levels", () => {
    expect(levelFromOsm({ amenity: "clinic", name: "Zahanati ya Kati" })).toBe("dispensary");
    expect(levelFromOsm({ amenity: "clinic", name: "Kituo cha Afya Juu" })).toBe("health_centre");
    expect(levelFromOsm({ amenity: "hospital", name: "KCMC" })).toBe("hospital");
    expect(levelFromOsm({ amenity: "pharmacy", name: "X" })).toBe("drug_shop");
  });
  it("keeps named clinics with coordinates, drops drug shops, unnamed points and duplicates", () => {
    const fs = facilitiesFromOsm(elements);
    expect(fs.map((f) => f.name)).toEqual(["Zahanati ya Mfano", "Hospitali ya Mfano", "Kituo cha Afya Mfano"]);
    expect(fs.every((f) => f.synthetic === false)).toBe(true);
    expect(fs[1]).toMatchObject({ lat: -3.32, lon: 37.33, level: "hospital" });
  });
  it("ranks real clinics by distance from the responder and books a simulated slot", () => {
    const fs = facilitiesFromOsm(elements);
    const slots = simulatedSlots(fs, "2026-10-05");
    const r = chooseReferral("refer_today", "health_centre", fs, { lat: -3.309, lon: 37.309 }, slots, "2026-10-05", new Set(), "08:15");
    expect(r?.choice.facility.name).toBe("Kituo cha Afya Mfano");
    expect(r?.slot).toMatchObject({ date: "2026-10-05", time: "08:30" });
  });
});
