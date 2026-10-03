import { useEffect, useState } from "react";
import { icd10, rulesDoc, testCases } from "../data";
import { encounterFromCase, type Encounter } from "../logic/encounter";
import { evaluate, type FlagDecision, type RulesResult } from "../logic/rules";
import { urgencyLabel } from "../logic/views";
import { createReferral, planReferral } from "../services/referrals";
import { db, resetLocalDb, uid } from "../storage/db";
import { demoNowIso, demoToday, setClockOffset } from "../sync/clock";
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
  | { name: "intake" }
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
      const plan = await planReferral(result, demoToday());
      if (!plan) throw new Error("No suitable facility found");
      const { referral } = await createReferral(enc, result, decisions, plan, demoNowIso());
      setScreen({ name: "referral", referralId: referral.id });
    } catch (e) {
      setError(String(e));
    }
  };

  const startDemo = async (caseId: string) => {
    const c = testCases.cases.find((x) => x.id === caseId)!;
    const enc = encounterFromCase(c.id, c.encounter, demoNowIso(), uid("enc"), DEMO_NAMES[caseId] ?? "Mama");
    await (await db()).put("encounters", enc);
    setScreen({ name: "result", enc });
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
          <Intake hasCuff={hasCuff} onCancel={() => setScreen({ name: "start" })} onFinish={(enc) => setScreen({ name: "result", enc })} />
        )}
        {screen.name === "result" && (
          <Result
            enc={screen.enc}
            onBack={() => setScreen(screen.enc.demoCaseId ? { name: "demo" } : { name: "intake" })}
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
