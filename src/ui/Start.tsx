import { activeFacilities, facilitiesAreReal } from "../facilities/registry";
import { useState } from "react";
import { useI18n } from "./i18n";
import { locales } from "../data";
import { countryByIso, getSetup } from "../setup/setup";
import { Card } from "./common";

export type Role = "responder" | "clinician" | "district";

export function Start({
  onRole,
  onDemo,
  onReset,
  onSetup,
  hasCuff,
  setHasCuff,
}: {
  onRole: (r: Role) => void;
  onDemo: () => void;
  onReset: () => void;
  onSetup: () => void;
  hasCuff: boolean;
  setHasCuff: (v: boolean) => void;
}) {
  const { t, pick } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const setup = getSetup();
  const country = setup ? countryByIso(setup.country) : undefined;
  const role = setup ? locales.roles.find((r) => r.id === setup.role) : undefined;
  const staff = country?.staff.find((l) => l.code === setup?.staffLang);
  return (
    <div className="screen">
      {setup && country && (
        <button type="button" className="setup-strip" onClick={onSetup} title={t("setup.change")}>
          <span>
            <b>{[setup.district, setup.region, country.name].filter(Boolean).join(", ")}</b>
            {role && <> · {pick(role)}</>}
            {setup.workId && <> · {t("setup.workid.short")} {setup.workId}</>}
          </span>
          <span className="muted small">
            {t("setup.patients.short")}: {setup.patientLangs.map((l) => l.native).join(", ")}
          </span>
          <span className="muted small">
            {facilitiesAreReal() ? t("start.clinics.real", { n: activeFacilities().length }) : t("start.clinics.sample")}
          </span>
        </button>
      )}
      {staff?.support === "ui_pending" && <p className="note-box">{t("setup.staff.pending")}</p>}
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
          <button type="button" className="btn secondary" onClick={onSetup}>
            {t("setup.change")}
          </button>
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
