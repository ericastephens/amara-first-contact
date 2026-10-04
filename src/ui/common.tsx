import type { ReactNode } from "react";
import { useI18n } from "./i18n";

export function SampleBadge() {
  const { t } = useI18n();
  return <span className="badge sample" title="Synthetic data from data/*synthetic* or &quot;synthetic&quot;: true">{t("sample")}</span>;
}

export function UrgencyPill({ urgency, label }: { urgency: string; label: string }) {
  return <span className={`urgency u-${urgency}`}>{label}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function SourceLink({ title, url }: { title: string; url: string }) {
  const { t } = useI18n();
  return (
    <span className="source">
      {t("result.source")}:{" "}
      <a href={url} target="_blank" rel="noreferrer">
        {title}
      </a>
    </span>
  );
}

/** Plays data/audio/<question_id>_<lang>.mp3 if it exists; falls back to the browser's speech synthesis. */
export function Speaker({ id, text }: { id: string; text: string }) {
  const { lang, t } = useI18n();
  const play = () => {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${id}_${lang}.mp3`);
    audio.play().catch(() => speak(text, lang));
  };
  return (
    <button type="button" className="speaker" onClick={play} aria-label={t("speaker")} title={t("speaker")}>
      🔊
    </button>
  );
}

export function speak(text: string, lang: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = ({ sw: "sw-TZ", en: "en-GB" } as Record<string, string>)[lang] ?? lang;
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}
