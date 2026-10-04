import { useState } from "react";
import { useI18n } from "./i18n";
import { nextUiLanguage } from "../setup/setup";
import { UI_NATIVE } from "../languages/packs";

// Demo PIN. A real deployment would derive a key from the PIN and encrypt the IndexedDB contents.
const DEMO_PIN = "1234";

export function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const press = (d: string) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setWrong(false);
    if (next.length === 4) {
      if (next === DEMO_PIN) onUnlock();
      else {
        setWrong(true);
        setPin("");
      }
    }
  };
  return (
    <div className="pin">
      <h1>{t("app.name")}</h1>
      <p className="muted">{t("app.tagline")}</p>
      <h2>{t("pin.title")}</h2>
      <div className="pin-dots" aria-label={`${pin.length} of 4`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? "dot full" : "dot"} />
        ))}
      </div>
      {wrong && <p className="error">{t("pin.wrong")}</p>}
      <div className="pin-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button type="button" key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" onClick={() => setLang(nextUiLanguage(lang))} className="small">
          {UI_NATIVE[nextUiLanguage(lang)] ?? t("lang.toggle")}
        </button>
        <button type="button" onClick={() => press("0")}>
          0
        </button>
        <button type="button" onClick={() => setPin(pin.slice(0, -1))} className="small" aria-label="delete">
          ⌫
        </button>
      </div>
      <p className="muted small">{t("pin.hint")}</p>
    </div>
  );
}
