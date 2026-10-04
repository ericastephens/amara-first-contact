// One-time setup driven by data/locales.json: place, role, staff language, patient languages, summary.
import { useMemo, useState } from "react";
import { locales } from "../data";
import type { Country, Language, Support } from "../data/schemas";
import {
  countryByIso,
  countryLanguages,
  defaultPatientLangs,
  validSetup,
  validWorkId,
  type Setup as SetupData,
} from "../setup/setup";
import { gpsPosition } from "../facilities/registry";
import { demoNowIso } from "../sync/clock";
import { NearbyClinics } from "./NearbyClinics";
import { Card } from "./common";
import { useI18n, type Lang } from "./i18n";

const STEPS = 5;
const ALWAYS_ROLES = ["clinician", "district"];

export function Setup({
  initial,
  onDone,
  onCancel,
}: {
  initial?: SetupData | null;
  onDone: (s: SetupData) => void;
  onCancel: () => void;
}) {
  const { t, lang, setLang, pick } = useI18n();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [other, setOther] = useState("");
  const [gps, setGps] = useState<"idle" | "busy" | "denied" | "failed">("idle");
  const useGps = async () => {
    setGps("busy");
    try {
      const p = await gpsPosition();
      setS((x) => ({ ...x, location: p }));
      setGps("idle");
    } catch (e) {
      setGps(String(e).includes("denied") ? "denied" : "failed");
    }
  };
  const [s, setS] = useState<Partial<SetupData>>(initial ?? {});
  const country = s.country ? countryByIso(s.country) : undefined;

  const countries = useMemo(
    () => locales.countries.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  const chooseCountry = (c: Country) => {
    if (s.country === c.iso) return;
    // switching country resets everything that depends on it
    setS({ country: c.iso, region: "", district: "", location: undefined, role: undefined, staffLang: c.staff_default, patientLangs: defaultPatientLangs(c) });
  };

  const chooseStaff = (l: Language) => {
    setS((x) => ({
      ...x,
      staffLang: l.code,
      patientLangs: x.patientLangs?.some((p) => p.code === l.code) ? x.patientLangs : [l, ...(x.patientLangs ?? [])],
    }));
    // The app interface exists in Swahili and English; other staff languages show English until translated.
    setLang((l.code === "sw" || l.code === "en" ? l.code : "en") as Lang);
  };

  const togglePatient = (l: Language) =>
    setS((x) => {
      const cur = x.patientLangs ?? [];
      return { ...x, patientLangs: cur.some((p) => p.code === l.code) ? cur.filter((p) => p.code !== l.code) : [...cur, l] };
    });

  const addOther = () => {
    const name = other.trim();
    if (!name) return;
    const code = `x-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const l: Language = { code, name, native: name, support: "keypad_audio" };
    setS((x) => ({ ...x, patientLangs: [...(x.patientLangs ?? []).filter((p) => p.code !== code), l] }));
    setOther("");
  };

  const stepValid = (): boolean => {
    if (step === 0) return Boolean(country) && (country!.regions.length === 0 || country!.regions.includes(s.region ?? ""));
    if (step === 1) return Boolean(s.role) && validWorkId(s.workId);
    if (step === 2) return Boolean(country?.staff.some((l) => l.code === s.staffLang));
    if (step === 3) return (s.patientLangs?.length ?? 0) > 0;
    return validSetup({ ...s, savedAt: "" });
  };

  const finish = () => {
    const full = { ...s, savedAt: demoNowIso() };
    if (validSetup(full)) onDone(full);
  };

  const regionLabel = country ? country.region_label[lang] ?? country.region_label.en : t("setup.region");
  const districtLabel = country?.district_label?.[lang] ?? country?.district_label?.en ?? t("setup.district");
  const roles = locales.roles.filter((r) => country && [...country.first_contacts, ...ALWAYS_ROLES].includes(r.id));
  const extraLangs = (s.patientLangs ?? []).filter((p) => !country || !countryLanguages(country).some((l) => l.code === p.code));
  const staff = country?.staff.find((l) => l.code === s.staffLang);

  return (
    <div className="screen setup">
      <div className="row between">
        <span className="eyebrow">{t(`setup.e${step + 1}`)}</span>
        <span className="muted small">{t("intake.step", { n: step + 1, total: STEPS })}</span>
      </div>
      <div className="progress">
        <span style={{ width: `${((step + 1) / STEPS) * 100}%` }} />
      </div>

      {step === 0 && (
        <Card>
          <h1>{t("setup.where")}</h1>
          <label className="field">
            {t("setup.search")}
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          </label>
          <div className="option-grid" role="radiogroup" aria-label={t("setup.country")}>
            {countries.map((c) => (
              <button
                type="button"
                key={c.iso}
                role="radio"
                aria-checked={s.country === c.iso}
                className={s.country === c.iso ? "option selected" : "option"}
                onClick={() => chooseCountry(c)}
              >
                <b>{c.name}</b>
                <span>
                  {c.dial} · {c.staff.map((l) => l.native).join(", ")}
                </span>
              </button>
            ))}
            {countries.length === 0 && <p className="muted">{t("setup.nocountry")}</p>}
          </div>
          {country && (
            <>
              <label className="field">
                {regionLabel}
                {country.regions.length > 0 ? (
                  <select value={s.region ?? ""} onChange={(e) => setS({ ...s, region: e.target.value })}>
                    <option value="">{t("setup.choose")}</option>
                    {country.regions.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <input value={s.region ?? ""} onChange={(e) => setS({ ...s, region: e.target.value })} autoComplete="off" />
                )}
              </label>
              <label className="field">
                {districtLabel}
                <input value={s.district ?? ""} onChange={(e) => setS({ ...s, district: e.target.value })} autoComplete="off" />
              </label>
              <div className="row">
                <button type="button" className="btn secondary" onClick={() => void useGps()} disabled={gps === "busy"}>
                  📍 {gps === "busy" ? t("setup.gps.busy") : t("setup.gps")}
                </button>
              </div>
              {s.location?.method === "gps" && (
                <p className="ok-line">
                  {t("setup.gps.ok", { lat: s.location.lat.toFixed(4), lon: s.location.lon.toFixed(4), acc: s.location.accuracyM ?? "?" })}
                </p>
              )}
              {gps === "denied" && <p className="warn">{t("setup.gps.denied")}</p>}
              {gps === "failed" && <p className="warn">{t("setup.gps.failed")}</p>}
              <p className="muted small">{t("setup.location.note")}</p>
            </>
          )}
        </Card>
      )}

      {step === 1 && country && (
        <Card>
          <h1>{t("setup.role")}</h1>
          <div className="option-grid one" role="radiogroup">
            {roles.map((r) => (
              <button
                type="button"
                key={r.id}
                role="radio"
                aria-checked={s.role === r.id}
                className={s.role === r.id ? "option selected" : "option"}
                onClick={() => setS({ ...s, role: r.id })}
              >
                <b>{pick(r)}</b>
              </button>
            ))}
          </div>
          <label className="field">
            {t("setup.name")}
            <input value={s.workerName ?? ""} onChange={(e) => setS({ ...s, workerName: e.target.value })} autoComplete="name" />
          </label>
          <label className="field">
            {t("setup.workid")} *
            <input
              value={s.workId ?? ""}
              onChange={(e) => setS({ ...s, workId: e.target.value })}
              autoComplete="off"
              autoCapitalize="characters"
              aria-invalid={Boolean(s.workId) && !validWorkId(s.workId)}
              aria-describedby="workid-help"
            />
          </label>
          <p id="workid-help" className={s.workId && !validWorkId(s.workId) ? "warn" : "muted small"}>
            {s.workId && !validWorkId(s.workId) ? t("setup.workid.bad") : t("setup.workid.help")}
          </p>
        </Card>
      )}

      {step === 2 && country && (
        <Card>
          <h1>{t("setup.staff")}</h1>
          <p className="muted">{t("setup.staff.help")}</p>
          <div className="lang-list" role="radiogroup">
            {country.staff.map((l) => (
              <LangRow key={l.code} l={l} checked={s.staffLang === l.code} radio onClick={() => chooseStaff(l)} />
            ))}
          </div>
          {staff?.support === "ui_pending" && <p className="note-box">{t("setup.staff.pending")}</p>}
        </Card>
      )}

      {step === 3 && country && (
        <Card>
          <h1>{t("setup.patients")}</h1>
          <p className="muted">{t("setup.patients.help")}</p>
          <div className="lang-list" role="group">
            {[...countryLanguages(country), ...extraLangs].map((l) => (
              <LangRow
                key={l.code}
                l={l}
                checked={Boolean(s.patientLangs?.some((p) => p.code === l.code))}
                onClick={() => togglePatient(l)}
              />
            ))}
          </div>
          <label className="field">
            {t("setup.other")}
            <span className="row">
              <input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOther();
                  }
                }}
                placeholder={t("setup.other.ph")}
                autoComplete="off"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="button" className="btn secondary" onClick={addOther}>
                {t("setup.add")}
              </button>
            </span>
          </label>
          <div className="support-legend">
            {(["full", "ui_pending", "keypad_audio"] as Support[]).map((k) => (
              <div key={k}>
                <SupportBadge level={k} /> <span className="muted small">{t(`setup.support.${k}`)}</span>
              </div>
            ))}
          </div>
          {(s.patientLangs?.length ?? 0) === 0 && <p className="warn">{t("setup.needone")}</p>}
        </Card>
      )}

      {step === 4 && country && (
        <Card>
          <h1>{t("setup.summary")}</h1>
          <dl className="summary">
            <dt>{t("setup.place")}</dt>
            <dd>{[s.district, s.region, country.name].filter(Boolean).join(", ")}</dd>
            <dt>{t("setup.role.short")}</dt>
            <dd>{pick(locales.roles.find((r) => r.id === s.role) ?? { en: "", sw: "" })}</dd>
            <dt>{t("setup.workid.short")}</dt>
            <dd>
              {s.workId}
              {s.workerName ? ` · ${s.workerName}` : ""}
            </dd>
            <dt>{t("setup.staff.short")}</dt>
            <dd>
              {staff?.native} {staff && <SupportBadge level={staff.support} />}
            </dd>
            <dt>{t("setup.patients.short")}</dt>
            <dd className="lang-chips">
              {(s.patientLangs ?? []).map((l) => (
                <span key={l.code} className="lang-chip">
                  {l.native}
                </span>
              ))}
            </dd>
            <dt>{t("setup.guidelines")}</dt>
            <dd>{country.guideline_pack.name}</dd>
            <dt>{t("setup.coding")}</dt>
            <dd>{country.coding}</dd>
            <dt>{t("setup.surveillance")}</dt>
            <dd>{country.surveillance}</dd>
            <dt>{t("setup.phone")}</dt>
            <dd>{country.dial}</dd>
          </dl>
          <NearbyClinics setup={s} country={country} onLocated={(location) => setS((x) => ({ ...x, location }))} />
          <p className={country.guideline_pack.status === "ready" ? "note-box" : "note-box amber"}>
            {country.guideline_pack.status === "ready" ? t("setup.guide.ready") : t("setup.guide.who")}
          </p>

        </Card>
      )}

      <div className="nav">
        <button type="button" className="btn secondary" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
          {t("back")}
        </button>
        {step < STEPS - 1 ? (
          <button type="button" className="btn primary" disabled={!stepValid()} onClick={() => setStep(step + 1)}>
            {t("next")}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!stepValid()} onClick={finish}>
            {t("setup.finish")}
          </button>
        )}
      </div>
    </div>
  );
}

export function SupportBadge({ level }: { level: Support }) {
  const { lang } = useI18n();
  return <span className={`badge support-${level}`}>{locales.support_levels[level][lang]}</span>;
}

function LangRow({ l, checked, radio, onClick }: { l: Language; checked: boolean; radio?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role={radio ? "radio" : "checkbox"}
      aria-checked={checked}
      className={`lang-row${radio ? " radio" : ""}${checked ? " selected" : ""}`}
      onClick={onClick}
    >
      <span className="tick" aria-hidden="true" />
      <span className="lang-name">
        <b>{l.native}</b>
        <span>{l.name}</span>
      </span>
      <SupportBadge level={l.support} />
    </button>
  );
}
