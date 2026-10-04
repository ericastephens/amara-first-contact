import { useEffect, useState } from "react";
import { icd10, questionnaires, rulesDoc, testCases } from "../data";
import { answersForSymptoms, encounterFromCase, type Encounter } from "../logic/encounter";
import { evaluate, type FlagDecision, type RulesResult } from "../logic/rules";
import { urgencyLabel } from "../logic/views";
import { createReferral, planReferral } from "../services/referrals";
import { db, resetLocalDb, uid } from "../storage/db";
import { localTime } from "../logic/time";
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
import { Landing } from "./Landing";
import { Setup } from "./Setup";
import { Start, type Role } from "./Start";
import { getSetup, onSetupChange, saveSetup, type Setup as SetupData } from "../setup/setup";
import { TopBar } from "./TopBar";

type Screen =
  | { name: "start" }
  | { name: "demo" }
  | { name: "intake"; initial?: Encounter; step?: number }
  | { name: "result"; enc: Encounter }
  | { name: "referral"; referralId: string }
  | { name: "clinician" }
  | { name: "district" };

// Synthetic names for the scripted demo patients.
const DEMO_NAMES: Record<string, string> = { demo_1: "Noor", demo_2: "Amina", demo_3: "Zawadi" };
// What each demo patient says in her own words. The intent model reads this live in the demo:
// it is the key AI moment, so demo mode starts at the free-text step instead of the result.
const DEMO_TEXT: Record<string, string> = {
  demo_2: "Kichwa kinaniuma sana, na naona giza giza",
  demo_3: "Mtoto ana homa na vipele mwili mzima",
};

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
  const [setup, setSetup] = useState<SetupData | null>(getSetup);
  // Landing and setup come before the PIN: they hold no patient data.
  const [gate, setGate] = useState<"landing" | "setup" | "app">(() => (getSetup() ? "app" : "landing"));
  useEffect(() => onSetupChange(() => setSetup(getSetup())), []);
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

  const startDemo = async (caseId: string) => {
    const c = testCases.cases.find((x) => x.id === caseId)!;
    const enc = encounterFromCase(c.id, c.encounter, demoNowIso(), uid("enc"), DEMO_NAMES[caseId] ?? "Mama");
    // Start from her words: the model suggests chips, the responder confirms them, then the questions follow.
    enc.answers = {
      ...answersForSymptoms(questionnaires, enc.group, c.encounter.symptoms),
      ...enc.answers,
      q_complaint: DEMO_TEXT[caseId] ?? c.encounter.free_text ?? "",
    };
    enc.chips = [];
    enc.uncertainChips = [];
    for (const k of Object.keys(enc.answers)) enc.answeredAt[k] = enc.createdAt;
    await (await db()).put("encounters", enc);
    setScreen({ name: "intake", initial: enc, step: 1 });
  };

  const reset = async () => {
    await resetLocalDb();
    await resetServer();
    setClockOffset(0);
    await notify();
    setScreen({ name: "start" });
  };

  if (gate === "landing")
    return (
      <Landing
        onStart={() => setGate("setup")}
        onDemoReady={() => {
          setGate("app");
          setLocked(true);
        }}
      />
    );
  if (gate === "setup")
    return (
      <div className="app">
        <main>
          <Setup
            initial={setup}
            onCancel={() => setGate(setup ? "app" : "landing")}
            onDone={(s) => {
              saveSetup(s);
              setGate("app");
            }}
          />
        </main>
      </div>
    );

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
          <Start
            onRole={go}
            onDemo={() => setScreen({ name: "demo" })}
            onReset={() => void reset()}
            onSetup={() => setGate("setup")}
            hasCuff={hasCuff}
            setHasCuff={setHasCuff}
          />
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
            key={screen.initial?.id ?? "new"}
            hasCuff={hasCuff}
            initial={screen.initial}
            initialStep={screen.step}
            onCancel={() => setScreen(screen.initial?.demoCaseId ? { name: "demo" } : { name: "start" })}
            onFinish={(enc) => setScreen({ name: "result", enc })}
          />
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
