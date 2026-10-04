// Result: urgency + reasons with sources. The responder confirms or overrides every flag (an override
// needs a reason) before a referral is created. "Go now" shows immediately, before anything else.
import { activeFacilities, responderSite } from "../../facilities/registry";
import { useEffect, useMemo, useState } from "react";
import { icd10, intentLabels, questionnaires, rulesDoc } from "../../data";
import { questionFor, toEncounterInput, visibleUnanswered, type Encounter } from "../../logic/encounter";
import { buildNote } from "../../logic/note";
import { suitableFacilities } from "../../logic/referral";
import { allFlagsDecided, applyDecisions, evaluate, summarise, type FlagDecision, type RulesResult } from "../../logic/rules";
import { clinicianView, motherView, responderView, urgencyLabel } from "../../logic/views";
import { patientLanguage, responderLabel } from "../../setup/setup";
import { db } from "../../storage/db";
import { Card, SourceLink, UrgencyPill } from "../common";
import { useI18n } from "../i18n";

type ViewTab = "responder" | "mother" | "clinician";

export function Result({
  enc,
  onBack,
  onCreate,
  onDone,
}: {
  enc: Encounter;
  onBack: () => void;
  onCreate: (result: RulesResult, decisions: FlagDecision[]) => void;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const input = useMemo(() => toEncounterInput(questionnaires, enc), [enc]);
  const base = useMemo(() => evaluate(rulesDoc, icd10, input), [input]);
  const [decisions, setDecisions] = useState<FlagDecision[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [overriding, setOverriding] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>("responder");
  const [askClinic, setAskClinic] = useState(false);

  const result = useMemo(() => {
    const decided = applyDecisions(rulesDoc, icd10, base, decisions, Boolean(input.uncertain));
    return askClinic && decided.fired.length === 0 ? summarise(rulesDoc, icd10, [], true, decided.unanswered) : decided;
  }, [base, decisions, input.uncertain, askClinic]);

  useEffect(() => {
    void db().then((d) => d.put("results", { encounterId: enc.id, result, decisions }));
  }, [enc.id, result, decisions]);

  const decide = (d: FlagDecision) => setDecisions((ds) => [...ds.filter((x) => x.ruleId !== d.ruleId), d]);
  const decisionFor = (id: string) => decisions.find((d) => d.ruleId === id);
  const ready = allFlagsDecided(base, decisions);
  const rv = responderView(rulesDoc, base, lang);
  // Only list questions the intake would actually show (e.g. the self-harm question only after low mood = yes).
  const unanswered = visibleUnanswered(questionnaires, enc, base.unanswered);
  const goNow = base.urgency === "go_now";
  const hospital = goNow ? suitableFacilities(activeFacilities(), base.facilityLevel ?? "hospital", responderSite())[0] : null;

  return (
    <div className="screen">
      {goNow && hospital && (
        <div className="gonow" role="alert">
          <strong>{t("result.gonow.banner")}</strong>
          <span>
            {lang === "sw" ? hospital.facility.name : hospital.facility.name_en} · {hospital.km.toFixed(1)} km
          </span>
        </div>
      )}
      <div className="row between">
        <h1>{t("result.title")}</h1>
        <UrgencyPill urgency={result.urgency} label={urgencyLabel(rulesDoc, result.urgency, lang)} />
      </div>

      <div className="tabs" role="tablist" aria-label={t("result.views")}>
        {(["responder", "mother", "clinician"] as ViewTab[]).map((v) => (
          <button type="button" role="tab" key={v} aria-selected={tab === v} className={tab === v ? "tab active" : "tab"} onClick={() => setTab(v)}>
            {t(`view.${v}`)}
          </button>
        ))}
      </div>

      {tab === "responder" && (
        <>
          <Card>
            <h2>{t("result.reasons")}</h2>
            {rv.reasons.length === 0 && (
              <>
                <p>{base.urgency === "ask_clinic" ? t("result.askclinic.hint") : t("result.none")}</p>
                {base.urgency !== "ask_clinic" && <p className="muted small">{t("result.none.hint")}</p>}
              </>
            )}
            {rv.reasons.map((r) => {
              const d = decisionFor(r.ruleId);
              const fired = base.fired.find((f) => f.id === r.ruleId)!;
              return (
                <div key={r.ruleId} className={`flag ${d?.decision ?? ""}`}>
                  <div className="row between">
                    <UrgencyPill urgency={fired.urgency} label={urgencyLabel(rulesDoc, fired.urgency, lang)} />
                    {d && <span className="small">{d.decision === "confirm" ? `✓ ${t("result.confirmed")}` : `↺ ${t("result.override.saved")}`}</span>}
                  </div>
                  <p>{r.text}</p>
                  <SourceLink title={r.source} url={r.sourceUrl} />
                  {overriding === r.ruleId ? (
                    <div className="override">
                      <label className="field">
                        {t("result.override.reason")}
                        <input value={drafts[r.ruleId] ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.ruleId]: e.target.value })} autoFocus />
                      </label>
                      <div className="row">
                        <button type="button" className="btn secondary" onClick={() => setOverriding(null)}>
                          {t("cancel")}
                        </button>
                        <button
                          type="button"
                          className="btn primary"
                          disabled={!drafts[r.ruleId]?.trim()}
                          onClick={() => {
                            decide({ ruleId: r.ruleId, decision: "override", reason: drafts[r.ruleId].trim() });
                            setOverriding(null);
                          }}
                        >
                          {t("save")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="row">
                      <button type="button" className={`btn ${d?.decision === "confirm" ? "primary" : "secondary"}`} onClick={() => decide({ ruleId: r.ruleId, decision: "confirm" })}>
                        ✓ {t("result.confirm")}
                      </button>
                      <button type="button" className={`btn ${d?.decision === "override" ? "warn-btn" : "secondary"}`} onClick={() => setOverriding(r.ruleId)}>
                        ↺ {t("result.override")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
          {unanswered.length > 0 && (
            <Card>
              <h3>{t("result.unanswered")}</h3>
              <ul>
                {unanswered.map((id) => {
                  const q = questionFor(questionnaires, id, enc.group);
                  return <li key={id}>{id === "q_bp" ? t("intake.bp") : q ? q[lang] : id}</li>;
                })}
              </ul>
              <button type="button" className="link" onClick={onBack}>
                ← {t("back")}
              </button>
            </Card>
          )}
        </>
      )}

      {tab === "mother" && <MotherPreview result={result} />}

      {tab === "clinician" && <ClinicianPreview enc={enc} result={result} decisions={decisions} />}

      <p className="muted small">{t("result.nodiag")}</p>
      {base.fired.length > 0 && !ready && <p className="warn">{t("result.decide")}</p>}

      <div className="nav">
        <button type="button" className="btn secondary" onClick={onBack}>
          {t("back")}
        </button>
        {result.urgency === "home_care_followup" ? (
          <>
            <button type="button" className="btn secondary" onClick={() => setAskClinic(true)}>
              {t("result.askclinic")}
            </button>
            <button type="button" className="btn primary" onClick={onDone}>
              {t("ref.done")}
            </button>
          </>
        ) : (
          <button type="button" className="btn primary" disabled={!ready} onClick={() => onCreate(result, decisions)}>
            {goNow ? t("result.paper") : t("result.send")}
          </button>
        )}
      </div>
    </div>
  );
}

function MotherPreview({ result }: { result: RulesResult }) {
  const { t, lang } = useI18n();
  const mv = motherView(rulesDoc, result, null, lang);
  return (
    <Card className="mother">
      <h2>{t("ref.mother.title")}</h2>
      <p className="big">{mv.urgencyLabel}</p>
      <p className="muted small">{t("result.mother.pending")}</p>
    </Card>
  );
}

function ClinicianPreview({ enc, result, decisions }: { enc: Encounter; result: RulesResult; decisions: FlagDecision[] }) {
  const { t, lang } = useI18n();
  const cv = clinicianView(rulesDoc, result, lang);
  const note = buildNote(enc, result, decisions, {
    questionnaires,
    labels: intentLabels,
    urgencyLabel: urgencyLabel(rulesDoc, result.urgency, "en"),
    responder: responderLabel(responderSite().name),
    languageName: (c) => patientLanguage(c)?.native,
  });
  return (
    <>
      <Card>
        <h2>{t("result.ruleout")}</h2>
        {cv.ruleOut.length === 0 && <p className="muted">—</p>}
        <ul className="codes">
          {cv.ruleOut.map((r) => (
            <li key={r.code}>
              <code>{r.code}</code> {r.title} <span className="badge draft">{t("result.draft")}</span>
            </li>
          ))}
        </ul>
        {!icd10.verified && <p className="muted small">ICD-10 list not yet verified against the WHO browser.</p>}
      </Card>
      <Card>
        <h2>{t("result.note")}</h2>
        <pre className="note">{note}</pre>
      </Card>
    </>
  );
}
