import { useEffect, useState } from "react";
import { detect } from "../ai/intent";
import { loadIntentModel } from "../ai/loadModel";
import { icd10, questionnaires, rulesDoc, testCases } from "../data";
import { demoEncounterFromCase, type Encounter } from "../logic/encounter";
import { evaluate, type FlagDecision, type RulesResult } from "../logic/rules";
import { localTime } from "../logic/time";
import { urgencyLabel } from "../logic/views";
import { createReferral, planReferral } from "../services/referrals";
import { db, resetLocalDb, uid } from "../storage/db";
import { demoNow, demoNowIso, demoToday, setClockOffset } from "../sync/clock";
import { resetServer, seedServer } from "../sync/mockServer";
import { notify, startSyncLoop } from "../sync/sync";
import { Clinician } from "./clinician/Clinician";
import { Card, UrgencyPill } from "./common";
import { District } from "./district/District";
import { useI18n } from "./i18n";
import { PinLock } from "./PinLock";
import { Intake } from "./responder/Intake";
import { ReferralView } from "./responder/ReferralView";
import { Result } from "./responder/Result";
import { Start, type Role } from "./Start";
import { TopBar } from "./TopBar";

type Screen =
  | { name: "start" }
  | { name: "demo" }
  | { name: "intake"; enc?: Encounter; step?: number }
  | { name: "result"; enc: Encounter }
  | { name: "referral"; referralId: string }
  | { name: "clinician" }
  | { name: "district" };

// Synthetic names for the scripted demo patients.
const DEMO_NAMES: Record<string, string> = { demo_1: "Noor", demo_2: "Amina", demo_3: "Zawadi" };

function readCuff(): boolean {
  try {
    return localStorage.getItem("amara.cuff") !== "no";
  } catch {
    return true;
  }
}

export function App() {
  const { t, lang } = useI18n();
  const [locked, setLocked] = useState(true);
  const [screen, setScreen] = useState<Screen>({ name: "start" });
  const [hasCuff, setHasCuffState] = useState(readCuff);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void seedServer().then(notify);
    return startSyncLoop(demoNowIso);
  }, []);

  const setHasCuff = (v: boolean) => {
    setHasCuffState(v);
    try {
      localStorage.setItem("amara.cuff", v ? "yes" : "no");
    } catch {
      // ignore
    }
  };

  const go = (role: Role) =>
    setScreen(role === "responder" ? { name: "intake" } : role === "clinician" ? { name: "clinician" } : { name: "district" });

  const create = async (enc: Encounter, result: RulesResult, decisions: FlagDecision[]) => {
    try {
      const plan = await planReferral(result, demoToday(), localTime(demoNow()));
      if (!plan) throw new Error("No suitable facility found");
      const { referral } = await createReferral(enc, result, decisions, plan, demoNowIso());
      setScreen({ name: "referral", referralId: referral.id });
    } catch (e) {
      setError(String(e));
    }
  };

  // Demo mode starts at the free-text step with her sentence typed in: the intent model reads it on screen.
  const startDemo = async (caseId: string) => {
    const c = testCases.cases.find((x) => x.id === caseId)!;
    let detected: string[] = [];
    try {
      const model = await loadIntentModel();
      detected = detect(model, c.encounter.free_text ?? "").symptoms.map((s) => s.id);
    } catch {
      // model unavailable: every symptom is answered on the keypad questions instead
    }
    const enc = demoEncounterFromCase(questionnaires, c.id, c.encounter, demoNowIso(), uid("enc"), DEMO_NAMES[caseId] ?? "Mama", detected);
    await (await db()).put("encounters", enc);
    setScreen({ name: "intake", enc, step: 1 });
  };

  const reset = async () => {
    await resetLocalDb();
    await resetServer();
    setClockOffset(0);
    await notify();
    setScreen({ name: "start" });
  };

  if (locked) return <PinLock onUnlock={() => setLocked(false)} />;

  return (
    <div className="app">
      <TopBar onHome={() => setScreen({ name: "start" })} onLock={() => setLocked(true)} />
      {error && (
        <div className="error-banner" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <main>
        {screen.name === "start" && (
          <Start onRole={go} onDemo={() => setScreen({ name: "demo" })} onReset={() => void reset()} hasCuff={hasCuff} setHasCuff={setHasCuff} />
        )}
        {screen.name === "demo" && (
          <div className="screen">
            <h1>{t("start.demo")}</h1>
            {["demo_1", "demo_2", "demo_3"].map((id) => {
              const c = testCases.cases.find((x) => x.id === id)!;
              const r = evaluate(rulesDoc, icd10, c.encounter);
              return (
                <Card key={id}>
                  <div className="row between">
                    <strong>{DEMO_NAMES[id]}</strong>
                    <UrgencyPill urgency={r.urgency} label={urgencyLabel(rulesDoc, r.urgency, lang)} />
                  </div>
                  <p className="small">{c.label}</p>
                  <button type="button" className="btn primary" onClick={() => void startDemo(id)}>
                    ▶ {t("next")}
                  </button>
                </Card>
              );
            })}
            <button type="button" className="btn secondary" onClick={() => setScreen({ name: "start" })}>
              {t("back")}
            </button>
          </div>
        )}
        {screen.name === "intake" && (
          <Intake
            hasCuff={hasCuff}
            initial={screen.enc}
            initialStep={screen.step}
            onCancel={() => setScreen(screen.enc?.demoCaseId ? { name: "demo" } : { name: "start" })}
            onFinish={(enc) => setScreen({ name: "result", enc })}
          />
        )}
        {screen.name === "result" && (
          <Result
            enc={screen.enc}
            hasCuff={hasCuff}
            onBack={() => setScreen({ name: "intake", enc: screen.enc, step: screen.enc.demoCaseId ? 1 : 3 })}
            onCreate={(result, decisions) => void create(screen.enc, result, decisions)}
            onDone={() => setScreen({ name: "start" })}
          />
        )}
        {screen.name === "referral" && <ReferralView referralId={screen.referralId} onDone={() => setScreen({ name: "start" })} />}
        {screen.name === "clinician" && <Clinician />}
        {screen.name === "district" && <District />}
      </main>
    </div>
  );
}
