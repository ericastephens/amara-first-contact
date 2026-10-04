// Responder intake, built from data/questionnaires.json.
// Step 1 who · Step 2 common block · Step 3 group module · Step 4 social & environment (+ optional BP).
import { useEffect, useMemo, useState } from "react";
import { facilitiesDoc, questionnaires } from "../../data";
import type { Group, Question } from "../../data/schemas";
import { isVisible, newEncounter, questionsForGroup, type Encounter } from "../../logic/encounter";
import { db, uid } from "../../storage/db";
import { demoNowIso } from "../../sync/clock";
import { Card } from "../common";
import { useI18n } from "../i18n";
import { Complaint } from "./Complaint";
import { QuestionField } from "./QuestionField";

const WARDS = [...new Set(facilitiesDoc.facilities.map((f) => f.ward))];

export function Intake({
  hasCuff,
  initial,
  initialStep = 0,
  onFinish,
  onCancel,
}: {
  hasCuff: boolean;
  /** An encounter to continue (Demo mode, or coming back from the result). */
  initial?: Encounter;
  initialStep?: number;
  onFinish: (enc: Encounter) => void;
  onCancel: () => void;
}) {
  const { t, pick } = useI18n();
  const [step, setStep] = useState(initialStep);
  const [enc, setEnc] = useState<Encounter | null>(initial ?? null);
  const roles = { has_bp_cuff: hasCuff };

  // Save every change to IndexedDB so nothing is lost on reload or a dead battery.
  useEffect(() => {
    if (enc) void db().then((d) => d.put("encounters", enc));
  }, [enc]);

  const modules = useMemo(() => (enc ? questionsForGroup(questionnaires, enc.group) : []), [enc]);
  const common = modules.find((m) => m.moduleId === "common")?.questions ?? [];
  const social = modules.find((m) => m.moduleId === "social_environment")?.questions ?? [];
  const groupQs = modules
    .filter((m) => m.moduleId !== "common" && m.moduleId !== "social_environment")
    .flatMap((m) => m.questions);
  const moduleNote = questionnaires.modules.find((m) => m.id === "stillbirth_support" && enc?.group === "stillbirth")?.note;

  const answer = (q: Question, v: string | undefined) =>
    setEnc((e) => {
      if (!e) return e;
      const answers = { ...e.answers };
      const answeredAt = { ...e.answeredAt };
      if (v === undefined) {
        delete answers[q.id];
        delete answeredAt[q.id];
      } else {
        answers[q.id] = v;
        answeredAt[q.id] = demoNowIso();
      }
      return { ...e, answers, answeredAt, updatedAt: demoNowIso() };
    });

  const start = (group: Group) => {
    const now = demoNowIso();
    setEnc((prev) => ({ ...(prev ?? newEncounter(group, now, uid("enc"))), group }));
  };

  const renderQs = (qs: Question[]) =>
    enc &&
    qs
      .filter((q) => q.id !== "q_complaint" && isVisible(q, enc, roles))
      .map((q) => (
        <div key={q.id}>
          <QuestionField question={q} value={enc.answers[q.id]} onChange={(v) => answer(q, v)} />
          {q.id === "q_meds_bought" && (
            <button
              type="button"
              className="quick"
              onClick={() => answer(q, [enc.answers[q.id], t("quick.mseto")].filter(Boolean).join(", "))}
            >
              + {t("quick.mseto")}
            </button>
          )}
        </div>
      ));

  const total = 4;
  const complaintQ = common.find((q) => q.id === "q_complaint");
  const consentMissing = enc && enc.answers.q_consent === undefined;

  return (
    <div className="screen intake">
      <div className="row between">
        <h1>{t("intake.title")}</h1>
        <span className="muted small">{t("intake.step", { n: step + 1, total })}</span>
      </div>
      <div className="progress">
        <span style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>

      {step === 0 && (
        <Card>
          <h2>{t("intake.who")}</h2>
          <div className="keypad column">
            {questionnaires.groups.map((g, i) => (
              <button
                type="button"
                key={g.id}
                className={enc?.group === g.id ? "key selected" : "key"}
                onClick={() => start(g.id)}
              >
                <span className="key-num">{i + 1}</span>
                {pick(g)}
              </button>
            ))}
          </div>
          {enc && (
            <>
              <label className="field">
                {t("intake.name")}
                <input value={enc.patientName} onChange={(e) => setEnc({ ...enc, patientName: e.target.value })} autoComplete="off" />
              </label>
              <label className="field">
                {t("intake.phone")}
                <input
                  type="tel"
                  inputMode="tel"
                  value={enc.phone}
                  onChange={(e) => setEnc({ ...enc, phone: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                {t("intake.ward")}
                <select value={enc.wardOfResidence} onChange={(e) => setEnc({ ...enc, wardOfResidence: e.target.value })}>
                  {WARDS.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </Card>
      )}

      {step === 1 && enc && (
        <Card>
          <h2>{t("intake.common")}</h2>
          {enc.demoCaseId && <p className="note-box">{t("demo.hint")}</p>}
          {complaintQ && (
            <Complaint
              label={pick(complaintQ)}
              value={enc.answers.q_complaint ?? ""}
              chips={enc.chips}
              uncertain={enc.uncertainChips}
              onChange={(text, chips, uncertainChips) =>
                setEnc((e) =>
                  e && {
                    ...e,
                    answers: text ? { ...e.answers, q_complaint: text } : (({ q_complaint: _, ...rest }) => rest)(e.answers),
                    chips,
                    uncertainChips,
                  },
                )
              }
            />
          )}
          {enc.demoCaseId && (
            <button type="button" className="btn primary wide" onClick={() => onFinish(enc)}>
              {t("demo.continue")} →
            </button>
          )}
          {renderQs(common)}
        </Card>
      )}

      {step === 2 && enc && (
        <Card>
          <h2>{t("intake.module")}</h2>
          {moduleNote && <p className="note-box">{moduleNote}</p>}
          {renderQs(groupQs)}
        </Card>
      )}

      {step === 3 && enc && (
        <Card>
          <h2>{t("intake.social")}</h2>
          {renderQs(social)}
          {hasCuff && (
            <div className="question" id="q_bp">
              <div className="q-label">{t("intake.bp")}</div>
              <div className="bp-row">
                <label>
                  {t("intake.bp.sys")}
                  <input
                    type="number"
                    inputMode="numeric"
                    value={enc.bp?.sys ?? ""}
                    onChange={(e) => setEnc(withBp(enc, "sys", e.target.value))}
                  />
                </label>
                <span>/</span>
                <label>
                  {t("intake.bp.dia")}
                  <input
                    type="number"
                    inputMode="numeric"
                    value={enc.bp?.dia ?? ""}
                    onChange={(e) => setEnc(withBp(enc, "dia", e.target.value))}
                  />
                </label>
              </div>
            </div>
          )}
          {consentMissing && <p className="warn">{t("intake.consent.required")}</p>}
        </Card>
      )}

      <div className="nav">
        <button type="button" className="btn secondary" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
          {t("back")}
        </button>
        {step < total - 1 ? (
          <button type="button" className="btn primary" disabled={!enc} onClick={() => setStep(step + 1)}>
            {t("next")}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!enc} onClick={() => enc && onFinish(enc)}>
            {t("intake.finish")}
          </button>
        )}
      </div>
    </div>
  );
}

function withBp(enc: Encounter, key: "sys" | "dia", raw: string): Encounter {
  const cur = { sys: enc.bp?.sys ?? NaN, dia: enc.bp?.dia ?? NaN, [key]: raw === "" ? NaN : Number(raw) };
  if (Number.isNaN(cur.sys) && Number.isNaN(cur.dia)) {
    const { bp: _, ...rest } = enc;
    return rest;
  }
  // a half-entered reading is kept in the form; only a complete reading is used by the rules
  return { ...enc, bp: { sys: cur.sys, dia: cur.dia } };
}
