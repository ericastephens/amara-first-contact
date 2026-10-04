// Public landing page: shown before setup and before the PIN. No patient data here.
import { demoSetup, saveSetup } from "../setup/setup";
import { loadNearby } from "../facilities/registry";
import { demoNowIso, demoToday } from "../sync/clock";
import { useI18n } from "./i18n";
import { UI_NATIVE, uiLanguages } from "../languages/packs";

const ICONS = [
  // works offline
  <path key="a" d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M3 3l18 18" />,
  // speaks her language
  <path key="b" d="M4 5h16v10H9l-5 4zM8 9h8M8 12h5" />,
  // a person decides
  <path key="c" d="M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c1-4 4-6 7-6s6 2 7 6M15.5 4.5l2 2 3-3" />,
];

const SMS_SW = "Habari Noor. Nenda Zahanati ya Ondera Jumanne saa 3 asubuhi. Namba yako: K47.";
const SMS_EN = "Hello Noor. Go to Ondera Dispensary on Tuesday at 9 am. Your number: K47.";

export function Landing({ onStart, onDemoReady }: { onStart: () => void; onDemoReady: () => void }) {
  const { t, lang, setLang } = useI18n();
  const quickDemo = () => {
    const s = demoSetup(demoNowIso());
    saveSetup(s);
    setLang("sw");
    // Live clinics around the demo position, in the background; the clinics baked in at build time
    // (or the sample clinics) are used until this succeeds.
    if (s.location) void loadNearby(s.location, demoToday()).catch(() => undefined);
    onDemoReady();
  };
  return (
    <div className="landing">
      <header className="landing-top">
        <div className="landing-brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 29V15" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <path d="M16 17c-6 0-9-4-9-9 5 0 9 3 9 9z" fill="currentColor" />
            <path d="M16 14c0-6 4-9 10-9 0 6-4 9-10 9z" fill="var(--sun)" />
          </svg>
          <span>{t("app.full")}</span>
        </div>
        <div className="seg" role="group" aria-label={t("landing.lang")}>
          {uiLanguages().map((l) => (
            <button type="button" key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {UI_NATIVE[l] ?? l}
            </button>
          ))}
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <h1>
            {t("landing.h1.a")} <em>{t("landing.h1.b")}</em>
            {t("landing.h1.c")}
          </h1>
          <p className="lead">{t("landing.lead")}</p>
          <ul className="points">
            {(["offline", "language", "person"] as const).map((k, i) => (
              <li key={k}>
                <span className="ic">
                  <svg viewBox="0 0 24 24">{ICONS[i]}</svg>
                </span>
                <span>
                  <b>{t(`landing.${k}.t`)}</b>
                  <span>{t(`landing.${k}.d`)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="cta">
            <button type="button" className="btn primary" onClick={onStart}>
              {t("landing.start")}
            </button>
            <button type="button" className="btn secondary" onClick={quickDemo}>
              {t("landing.demo")}
            </button>
          </div>
          <p className="muted small">{t("landing.once")}</p>
        </div>

        <figure className="hero-phone" aria-label={t("landing.sms.label")}>
          <div className="hero-phone-meta">
            <span>{t("landing.sms.label")}</span>
            <span>17:42</span>
          </div>
          <div className="bubble">
            {SMS_SW}
            <small>Kiswahili · {SMS_SW.length}/160</small>
          </div>
          <div className="bubble">
            {SMS_EN}
            <small>English · {SMS_EN.length}/160</small>
          </div>
          <figcaption className="muted small">{t("landing.sms.note")}</figcaption>
        </figure>
      </section>

      <p className="muted small landing-foot">{t("landing.foot")}</p>
    </div>
  );
}
