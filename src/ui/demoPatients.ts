// Scripted demo patients. Names are synthetic; each maps to a case in data/test_cases.json, so the
// urgency a judge sees always comes from the real rules engine, never from this file.
export interface DemoPatient {
  caseId: string;
  name: string;
  /** What she says, in Swahili. The on-device model reads this live. */
  sw: string;
  /** English translation for judges and investors. */
  en: string;
  /** One line of context in English. */
  who: string;
}

export const DEMO_PATIENTS: DemoPatient[] = [
  {
    caseId: "demo_2",
    name: "Amina",
    sw: "Kichwa kinaniuma sana, naona giza giza, miguu imevimba, na nimechoka",
    en: "A very bad headache, my vision is going dark, my legs are swollen, and I'm tired",
    who: "32 weeks pregnant",
  },
  {
    caseId: "demo_1",
    name: "Noor",
    sw: "Nimemeza mseto lakini homa bado ipo, na kuna panya wengi nyumbani, nimechoka",
    en: "I took malaria pills but the fever is still there, and there are many rats at home. I'm tired",
    who: "Farmer, 38",
  },
  {
    caseId: "adult_long_cough",
    name: "Neema",
    sw: "Nina kikohozi kwa wiki tatu",
    en: "I've had a cough for three weeks",
    who: "Mother of two",
  },
  {
    caseId: "demo_3",
    name: "Zawadi",
    sw: "Mtoto ana homa na vipele mwili mzima",
    en: "My child has a fever and a rash all over",
    who: "Baby Baraka, 18 months",
  },
];

export const DEMO_BY_CASE: Record<string, DemoPatient> = Object.fromEntries(DEMO_PATIENTS.map((p) => [p.caseId, p]));
