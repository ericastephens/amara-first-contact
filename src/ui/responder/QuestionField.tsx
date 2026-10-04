import type { Question } from "../../data/schemas";
import { getSetup, patientLanguage } from "../../setup/setup";
import { SupportBadge } from "../Setup";
import { optionLabel, useI18n } from "../i18n";
import { Speaker } from "../common";

const UNIT_KEY: Record<string, string> = { days: "intake.days", weeks: "intake.weeks", months: "intake.months" };

export function QuestionField({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const { t, pick } = useI18n();
  const label = pick(question);
  // The patient's language: offer the languages chosen in setup instead of a fixed list.
  const setupLangs = question.id === "q_language" ? getSetup()?.patientLangs : undefined;
  const options = setupLangs?.length ? setupLangs.map((l) => l.code) : question.options ?? [];
  const optLabel = (o: string) => (setupLangs ? patientLanguage(o)?.native ?? o : optionLabel(t, question.id, o));
  return (
    <div className={`question q-${question.type}`} id={question.id}>
      <div className="q-label">
        <span>{label}</span>
        <Speaker id={question.id} text={label} />
      </div>
      {question.sensitive && <p className="sensitive">⚠ {t("intake.sensitive")}</p>}
      {question.type === "yes_no" && (
        <div className="keypad">
          {(["yes", "no", "dont_know"] as const).map((a, i) => (
            <button
              type="button"
              key={a}
              className={value === a ? "key selected" : "key"}
              onClick={() => onChange(value === a ? undefined : a)}
              aria-pressed={value === a}
            >
              <span className="key-num">{i + 1}</span>
              {t(`ans.${a}`)}
            </button>
          ))}
        </div>
      )}
      {question.type === "choice" && (
        <div className="keypad wrap">
          {options.map((o, i) => (
            <button
              type="button"
              key={o}
              className={value === o ? "key selected" : "key"}
              onClick={() => onChange(value === o ? undefined : o)}
              aria-pressed={value === o}
            >
              <span className="key-num">{i + 1}</span>
              {optLabel(o)}
              {setupLangs && <SupportBadge level={patientLanguage(o)?.support ?? "keypad_audio"} />}
            </button>
          ))}
        </div>
      )}
      {question.type === "number" && (
        <div className="number-row">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
            aria-label={label}
          />
          {question.unit && <span className="muted">{t(UNIT_KEY[question.unit] ?? question.unit)}</span>}
        </div>
      )}
      {question.type === "free_text" && (
        <textarea
          rows={2}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label={label}
          placeholder={t("intake.complaint.placeholder")}
        />
      )}
    </div>
  );
}
