// Desktop "judge shell": the app inside a phone frame, with a companion panel that lets a judge or investor
// run a scripted patient, switch between the four parts of the system, and toggle offline mode.
// On narrow screens the companion folds into a bottom sheet behind a floating "Guide" button.
// The shell only frames the app: every result shown still comes from the rules engine on the phone.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { icd10, rulesDoc, testCases } from "../data";
import { evaluate } from "../logic/rules";
import { urgencyLabel } from "../logic/views";
import { setSimulatedNetwork } from "../sync/network";
import { UrgencyPill } from "./common";
import { DEMO_PATIENTS } from "./demoPatients";
import { useNetwork, useSyncStatus } from "./hooks";
import { useI18n } from "./i18n";

export type ShellView = "shop" | "sms" | "clinic" | "district";

const VIEWS: { id: ShellView; icon: string; label: string; hint: string }[] = [
  { id: "shop", icon: "🏪", label: "Drug shop", hint: "First responder intake" },
  { id: "sms", icon: "📱", label: "Mother's SMS", hint: "Referral and slip" },
  { id: "clinic", icon: "🏥", label: "Clinic", hint: "Referrals arriving" },
  { id: "district", icon: "📊", label: "District", hint: "Outbreak watch" },
];

function useWide(min = 900): boolean {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return !!wide;
}

interface Props {
  onHome: () => void;
  onWelcome: () => void;
  view: ShellView;
  hasReferral: boolean;
  onView: (v: ShellView) => void;
  onPatient: (caseId: string) => void;
  children: ReactNode;
}

export function DemoShell({ onHome, onWelcome, view, hasReferral, onView, onPatient, children }: Props) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const { lang, setLang } = useI18n();
  // Judges and investors on a laptop see the app in English first; the language button switches to Swahili.
  useEffect(() => {
    if (!wide || lang === "en") return;
    try {
      if (sessionStorage.getItem("amara.shell.lang")) return;
      sessionStorage.setItem("amara.shell.lang", "1");
    } catch {
      return;
    }
    setLang("en");
  }, [wide, lang, setLang]);

  const panel = (
    <Companion
      onHome={() => { onHome(); setOpen(false); }}
      onWelcome={() => { onWelcome(); setOpen(false); }}
      view={view}
      hasReferral={hasReferral}
      onView={(v) => { onView(v); setOpen(false); }}
      onPatient={(id) => { onPatient(id); setOpen(false); }}
    />
  );

  if (!wide)
    return (
      <>
        {children}
        <button type="button" className="guide-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">
          🧭 Guide
        </button>
        {open && (
          <div className="guide-sheet" role="dialog" aria-label="Demo guide" onClick={() => setOpen(false)}>
            <div className="guide-sheet-body" onClick={(e) => e.stopPropagation()}>
              <div className="guide-sheet-head">
                <strong>Demo guide</strong>
                <button type="button" className="guide-x" onClick={() => setOpen(false)} aria-label="Close">
                  ✕
                </button>
              </div>
              <Switcher view={view} hasReferral={hasReferral} onView={(v) => { onView(v); setOpen(false); }} />
              {panel}
            </div>
          </div>
        )}
      </>
    );

  return (
    <div className="shell">
      <div className="shell-top">
        <button type="button" className="shell-brand" onClick={onHome} title="Back to the app's start screen">
          <strong>Amara First Contact</strong>
          <span>Interactive demo · runs offline on the phone</span>
        </button>
        <Switcher view={view} hasReferral={hasReferral} onView={onView} />
      </div>
      <div className="shell-grid">
        <div className="device" aria-label="Phone running Amara First Contact">
          <div className="device-notch" aria-hidden="true" />
          <div className="device-screen">{children}</div>
        </div>
        <aside className="companion">{panel}</aside>
      </div>
    </div>
  );
}

function Switcher({ view, hasReferral, onView }: { view: ShellView; hasReferral: boolean; onView: (v: ShellView) => void }) {
  return (
    <nav className="switcher" aria-label="Parts of the system">
      {VIEWS.map((v) => {
        const disabled = v.id === "sms" && !hasReferral;
        return (
          <button
            key={v.id}
            type="button"
            className={`switch-btn${view === v.id ? " on" : ""}`}
            aria-current={view === v.id ? "page" : undefined}
            disabled={disabled}
            title={disabled ? "Run a patient first to create a referral" : v.hint}
            onClick={() => onView(v.id)}
          >
            <span aria-hidden="true">{v.icon}</span> {v.label}
          </button>
        );
      })}
    </nav>
  );
}

function Companion({ onHome, onWelcome, view, hasReferral, onView, onPatient }: Omit<Props, "children">) {
  const { lang, setLang } = useI18n();
  const net = useNetwork();
  const sync = useSyncStatus();
  const offline = !sync.online;
  const results = useMemo(
    () =>
      Object.fromEntries(
        DEMO_PATIENTS.map((p) => {
          const c = testCases.cases.find((x) => x.id === p.caseId)!;
          return [p.caseId, evaluate(rulesDoc, icd10, c.encounter).urgency];
        }),
      ),
    [],
  );
  const stepIndex = VIEWS.findIndex((v) => v.id === view);

  return (
    <div className="companion-body">
      <section className="cmp-card">
        <p className="cmp-k">Try a scripted patient</p>
        <p className="cmp-note">Tap one. Her words load in Swahili and the AI reads them on the phone. Confirm what it heard, answer the questions, and the rules set urgency.</p>
        <div className="langswitch" role="group" aria-label="App language">
          <span>App language</span>
          <button type="button" className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
          <button type="button" className={lang === "sw" ? "on" : ""} aria-pressed={lang === "sw"} onClick={() => setLang("sw")}>Kiswahili</button>
        </div>
        <div className="patients">
          {DEMO_PATIENTS.map((p) => (
            <button key={p.caseId} type="button" className="patient" onClick={() => onPatient(p.caseId)}>
              <span className="patient-top">
                <strong>{p.name}</strong>
                <span className="patient-who">{p.who}</span>
                <UrgencyPill urgency={results[p.caseId]} label={urgencyLabel(rulesDoc, results[p.caseId], "en")} />
              </span>
              <span className="patient-sw" lang="sw">“{p.sw}”</span>
              <span className="patient-en">{p.en}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="cmp-card">
        <p className="cmp-k">Runs on the phone</p>
        <div className="badges">
          <span className="badge-live">🧠 AI model: 660 KB, on the phone</span>
          <span className={`badge-live ${offline ? "warn" : ""}`}>
            {offline ? `📴 Offline · nothing sent · ${sync.queued} queued` : "📶 Online · queue syncs to the clinic"}
          </span>
        </div>
        <label className="killswitch">
          <input type="checkbox" checked={!net.simulatedOn} onChange={(e) => setSimulatedNetwork(!e.target.checked)} />
          <span className="ks-track" aria-hidden="true">
            <span className="ks-thumb" />
          </span>
          <span>✈️ Simulate offline</span>
        </label>
        {offline && (
          <p className="offline-note" role="status">
            Offline: the AI and rules run on the phone. Referrals wait in a queue and sync when the network returns.
          </p>
        )}
      </section>

      <section className="cmp-card">
        <p className="cmp-k">The closed loop</p>
        <ol className="loop">
          {VIEWS.map((v, i) => {
            const disabled = v.id === "sms" && !hasReferral;
            return (
              <li key={v.id} className={i === stepIndex ? "now" : i < stepIndex ? "past" : ""}>
                <button type="button" disabled={disabled} onClick={() => onView(v.id)}>
                  <span className="loop-dot" aria-hidden="true">{v.icon}</span>
                  <span>
                    <strong>{v.label}</strong>
                    <small>{disabled ? "Run a patient first" : v.hint}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="cmp-card">
        <p className="cmp-k">Work ID</p>
        <p className="cmp-note">
          The worker's licence or staff number, printed on every referral and outbreak approval so the clinic and district know who sent it. In the demo, <b>ADDO-KLM-0421</b> is a sample for Rehema, a drug shop dispenser in Kilimanjaro.
        </p>
      </section>

      <nav className="cmp-nav" aria-label="Go to">
        <button type="button" onClick={onHome}>⌂ App start screen</button>
        <button type="button" onClick={onWelcome}>← App welcome page</button>
        <a href={`${import.meta.env.BASE_URL}story/`}>Project website ↗</a>
      </nav>

      <p className="cmp-foot">Demo data is synthetic. The app never gives a diagnosis to the mother; a person confirms every flag.</p>
    </div>
  );
}
