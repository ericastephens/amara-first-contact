import { useState } from "react";
import { useI18n } from "./i18n";
import { Card } from "./common";

export type Role = "responder" | "clinician" | "district";

export function Start({
  onRole,
  onDemo,
  onReset,
  hasCuff,
  setHasCuff,
}: {
  onRole: (r: Role) => void;
  onDemo: () => void;
  onReset: () => void;
  hasCuff: boolean;
  setHasCuff: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  return (
    <div className="screen">
      <h1>{t("start.title")}</h1>
      <div className="roles">
        {(["responder", "clinician", "district"] as Role[]).map((r) => (
          <button type="button" key={r} className={`role role-${r}`} onClick={() => onRole(r)}>
            <strong>{t(`start.${r}`)}</strong>
            <span>{t(`start.${r}.desc`)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn secondary wide" onClick={onDemo}>
        ▶ {t("start.demo")}
      </button>
      <button type="button" className="link" onClick={() => setShowSettings(!showSettings)}>
        ⚙ {t("start.settings")}
      </button>
      {showSettings && (
        <Card>
          <label className="row">
            <input type="checkbox" checked={hasCuff} onChange={(e) => setHasCuff(e.target.checked)} /> {t("start.cuff")}
          </label>
          <p className="muted small">{t("start.languages")}</p>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (confirm(t("start.reset.confirm"))) onReset();
            }}
          >
            {t("start.reset")}
          </button>
        </Card>
      )}
      <p className="muted small">{t("review.pending")}</p>
    </div>
  );
}
