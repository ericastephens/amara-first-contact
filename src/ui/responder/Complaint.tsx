// Free-text complaint box + the small intent model. Detected items become chips the responder
// confirms or removes; low-confidence chunks become grey "Not sure" chips. Only confirmed chips count.
import { useEffect, useRef, useState } from "react";
import { detect, type IntentModel } from "../../ai/intent";
import { loadIntentModel } from "../../ai/loadModel";
import { labelFor } from "../../data";
import { tr } from "../../logic/lang";
import type { Chip, UncertainChip } from "../../logic/encounter";
import { useI18n } from "../i18n";
import { Speaker } from "../common";

export function Complaint({
  label,
  value,
  chips,
  uncertain,
  onChange,
}: {
  label: string;
  value: string;
  chips: Chip[];
  uncertain: UncertainChip[];
  onChange: (text: string, chips: Chip[], uncertain: UncertainChip[]) => void;
}) {
  const { t, lang } = useI18n();
  const [model, setModel] = useState<IntentModel | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs so the debounced detection always sees the latest model and chips (typing can start before the model loads).
  const modelRef = useRef<IntentModel | null>(null);
  const latest = useRef({ value, chips, uncertain });
  latest.current = { value, chips, uncertain };

  useEffect(() => {
    loadIntentModel()
      .then((m) => {
        modelRef.current = m;
        setModel(m);
        setState("ready");
      })
      .catch(() => setState("failed"));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Text typed while the model was loading: read it as soon as the model is ready.
  useEffect(() => {
    const { value: text, chips: c, uncertain: u } = latest.current;
    if (model && text.trim() && c.length === 0 && u.length === 0) run(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const run = (text: string) => {
    const m = modelRef.current;
    if (!m) return;
    const { chips } = latest.current;
    const r = detect(m, text);
    // keep the responder's earlier decisions for labels that are still detected
    const next: Chip[] = r.symptoms.map((s) => {
      const prev = chips.find((c) => c.id === s.id);
      return { id: s.id, text: s.text, confidence: s.confidence, status: prev?.status ?? "suggested" };
    });
    // chips confirmed earlier but no longer in the text stay, so nothing silently disappears
    for (const c of chips) if (c.status === "confirmed" && !next.some((n) => n.id === c.id)) next.push(c);
    const unc: UncertainChip[] = r.uncertain.map((u) => ({ ...u, status: "open" }));
    onChange(text, next, unc);
  };

  const onText = (text: string) => {
    onChange(text, latest.current.chips, latest.current.uncertain);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(text), 700);
  };

  const setChip = (id: string, status: Chip["status"]) =>
    onChange(value, chips.map((c) => (c.id === id ? { ...c, status } : c)), uncertain);

  const label_ = (id: string) => {
    const l = labelFor(id);
    return l ? tr(l, lang) : id;
  };

  return (
    <div className="question complaint" id="q_complaint">
      <div className="q-label">
        <span>{label}</span>
        <Speaker id="q_complaint" text={label} />
      </div>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onText(e.target.value)}
        placeholder={t("intake.complaint.placeholder")}
        aria-label={label}
      />
      <div className="row between">
        <button type="button" className="btn secondary" disabled={state !== "ready" || !value.trim()} onClick={() => run(value)}>
          🧠 {t("intake.detect")}
        </button>
        {state === "loading" && <span className="muted small">{t("intake.model.loading")}</span>}
        {state === "failed" && <span className="error small">{t("intake.model.failed")}</span>}
      </div>
      {(chips.length > 0 || uncertain.length > 0) && (
        <div className="chips">
          <p className="small muted">{t("intake.detected")}</p>
          {chips
            .filter((c) => c.status !== "removed")
            .map((c) => (
              <span key={c.id} className={`chip ${c.status}`}>
                <button
                  type="button"
                  className="chip-main"
                  onClick={() => setChip(c.id, c.status === "confirmed" ? "suggested" : "confirmed")}
                  aria-pressed={c.status === "confirmed"}
                  title={`${Math.round(c.confidence * 100)}%`}
                >
                  {c.status === "confirmed" ? "✓ " : "? "}
                  {label_(c.id)}
                </button>
                <button type="button" className="chip-x" onClick={() => setChip(c.id, "removed")} aria-label="remove">
                  ✕
                </button>
              </span>
            ))}
          {uncertain
            .filter((u) => u.status === "open")
            .map((u, i) => (
              <span key={i} className="chip uncertain" title={t("intake.notsure.hint")}>
                <span className="chip-main">
                  {t("intake.notsure")}: “{u.text}”
                </span>
                <button
                  type="button"
                  className="chip-x"
                  onClick={() => onChange(value, chips, uncertain.map((x, j) => (j === i ? { ...x, status: "dismissed" } : x)))}
                  aria-label="dismiss"
                >
                  ✕
                </button>
              </span>
            ))}
          {uncertain.some((u) => u.status === "open") && <p className="small muted">{t("intake.notsure.hint")}</p>}
          {lang !== "en" && chips.some((c) => c.status !== "removed") && (
            <p className="small muted">
              {t("intake.translation")}: {chips.filter((c) => c.status !== "removed").map((c) => labelFor(c.id)?.en).join("; ")}
            </p>
          )}
        </div>
      )}
      {state === "ready" && value.trim().length > 3 && chips.length === 0 && uncertain.length === 0 && (
        <p className="small muted">{t("intake.nochips")}</p>
      )}
    </div>
  );
}
