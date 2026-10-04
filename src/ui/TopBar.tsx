import { useI18n } from "./i18n";
import { nextUiLanguage } from "../setup/setup";
import { UI_NATIVE } from "../languages/packs";
import { useNetwork, useSyncStatus } from "./hooks";
import { setSimulatedNetwork } from "../sync/network";

export function TopBar({ onHome, onLock }: { onHome: () => void; onLock: () => void }) {
  const { t, lang, setLang } = useI18n();
  const net = useNetwork();
  const sync = useSyncStatus();
  const time = sync.lastSynced ? new Date(sync.lastSynced).toTimeString().slice(0, 5) : null;
  let pill: string;
  let pillClass: string;
  if (!sync.online) {
    pill = t("sync.offline", { n: sync.queued });
    pillClass = "offline";
  } else if (sync.queued > 0) {
    pill = t("sync.queued", { n: sync.queued });
    pillClass = "syncing";
  } else {
    pill = time ? t("sync.synced", { time }) : t("sync.never");
    pillClass = "synced";
  }
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={onHome}>
        {t("app.name")}
      </button>
      <span className={`pill ${pillClass}`} role="status">
        {pill}
      </span>
      <div className="topbar-actions">
        <button type="button" className="chip-btn" onClick={() => setLang(nextUiLanguage(lang))} title={UI_NATIVE[lang] ?? lang}>
          {lang.toUpperCase()}
        </button>
        <button
          type="button"
          className={`chip-btn net ${net.simulatedOn ? "on" : "off"}`}
          onClick={() => setSimulatedNetwork(!net.simulatedOn)}
          aria-pressed={net.simulatedOn}
          title={net.simulatedOn ? t("net.on") : t("net.off")}
        >
          {net.simulatedOn ? "📶" : "✈️"}
        </button>
        <button type="button" className="chip-btn" onClick={onLock} title={t("pin.lock")}>
          🔒
        </button>
      </div>
    </header>
  );
}
