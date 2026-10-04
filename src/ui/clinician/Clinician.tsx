// Clinic dashboard: referrals received (after sync), the full note, draft ICD-10 codes the clinician
// confirms or edits, arrival tracking with the demo clock, and outbreak watch.
import { responderSite } from "../../facilities/registry";
import { formatLocal } from "../../logic/time";
import { useState } from "react";
import { rulesDoc, smsDoc } from "../../data";
import { renderSms, renderVoice } from "../../logic/sms";
import { DRAFT_LABEL, urgencyLabel } from "../../logic/views";
import { uid, type SmsMessage } from "../../storage/db";
import { clockOffsetHours, demoNow, demoNowIso, setClockOffset } from "../../sync/clock";
import { listClinicReferrals, markNotArrived, updateClinicReferral, type ClinicReferral } from "../../sync/mockServer";
import { Card, UrgencyPill } from "../common";
import { useDemoClock, useLive } from "../hooks";
import { useI18n } from "../i18n";
import { OutbreakPanel, SiteSyncList } from "../OutbreakPanel";
import { loadOutbreakState, type OutbreakState } from "../outbreakData";

function reminderFor(r: ClinicReferral): SmsMessage {
  const input = { name: r.patientName, clinic: r.lang === "sw" ? r.facilityName : r.facilityNameEn, code: r.code };
  const text =
    r.channel === "voice"
      ? renderVoice(smsDoc, "did_you_go", r.lang, { ...input, responder: responderSite().name })
      : renderSms(smsDoc, "did_you_go", r.lang, input);
  const evening = new Date(demoNow());
  evening.setHours(18, 0, 0, 0);
  return {
    id: uid("sms"),
    referralId: r.id,
    to: r.phone,
    lang: r.lang,
    channel: r.channel,
    templateId: "did_you_go",
    text,
    status: "queued",
    createdAt: demoNowIso(),
    scheduledFor: evening.toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
  };
}

export function Clinician() {
  const { t, lang } = useI18n();
  const now = useDemoClock();
  const [open, setOpen] = useState<string | null>(null);
  const [refs, reload] = useLive<ClinicReferral[]>(
    async () => {
      await markNotArrived(demoNow(), reminderFor);
      return listClinicReferrals();
    },
    [],
    [now.getTime()],
  );
  const [outbreak, reloadOutbreak] = useLive<OutbreakState | null>(() => loadOutbreakState(demoNowIso()), null);
  const current = refs.find((r) => r.id === open);

  return (
    <div className="screen">
      <h1>{t("clin.title")}</h1>
      <Card className="clock">
        <span>
          {t("clin.clock")}: <strong>{formatLocal(now)}</strong>
          {clockOffsetHours() ? ` (+${clockOffsetHours()} h)` : ""}
        </span>
        <div className="row">
          <button type="button" className="btn secondary" onClick={() => setClockOffset(clockOffsetHours() + 48)}>
            {t("clin.clock.advance")}
          </button>
          {clockOffsetHours() !== 0 && (
            <button type="button" className="btn secondary" onClick={() => setClockOffset(0)}>
              {t("clin.clock.reset")}
            </button>
          )}
        </div>
      </Card>

      <Card>
        <h2>{t("clin.today")}</h2>
        {refs.length === 0 && <p className="muted">{t("clin.empty")}</p>}
        <ul className="referrals">
          {refs.map((r) => (
            <li key={r.id} className={`ref-row u-border-${r.urgency}`}>
              <div className="row between">
                <span className="code-big small-code">{r.code}</span>
                <UrgencyPill urgency={r.urgency} label={urgencyLabel(rulesDoc, r.urgency, lang)} />
              </div>
              <p className="small">{r.reasons.map((x) => x[lang]).join(" · ") || t("result.askclinic.hint")}</p>
              <p className="small muted">
                {r.facilityNameEn}
                {r.slot ? ` · ${r.slot.date} ${r.slot.time} (${t(`ref.slot.${r.slotStatus}`)})` : ""}
              </p>
              <div className="row between">
                <span className={`arrival ${r.arrival}`}>
                  {r.arrival === "arrived" ? `✓ ${t("clin.arrived")}` : r.arrival === "not_arrived" ? `⚠ ${t("clin.notArrived")}` : t("clin.expected")}
                </span>
                <div className="row">
                  {r.arrival !== "arrived" && (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => void updateClinicReferral(r.id, { arrival: "arrived", arrivedAt: demoNowIso() }).then(reload)}
                    >
                      {t("clin.markArrived")}
                    </button>
                  )}
                  <button type="button" className="btn primary" onClick={() => setOpen(r.id)}>
                    {t("clin.open")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {current && <NoteModal referral={current} onClose={() => setOpen(null)} onSaved={reload} />}

      {outbreak && (
        <>
          <OutbreakPanel state={outbreak} role="clinician" onChange={reloadOutbreak} />
          <SiteSyncList state={outbreak} />
        </>
      )}
    </div>
  );
}

function NoteModal({ referral, onClose, onSaved }: { referral: ClinicReferral; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [codes, setCodes] = useState(referral.ruleOut.map((r) => ({ ...r, confirmed: referral.confirmedCodes?.includes(r.code) ?? false })));
  const [editing, setEditing] = useState<string | null>(null);
  const save = async (next: typeof codes) => {
    setCodes(next);
    await updateClinicReferral(referral.id, {
      confirmedCodes: next.filter((c) => c.confirmed).map((c) => c.code),
      ruleOut: next.map(({ code, title }) => ({ code, title })),
    });
    onSaved();
  };
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-body">
        <div className="row between">
          <h2>
            {referral.code} · {referral.patientName || "—"}
          </h2>
          <button type="button" className="btn secondary" onClick={onClose}>
            {t("clin.close")}
          </button>
        </div>
        <h3>{t("clin.codes")}</h3>
        <ul className="codes">
          {codes.map((c) => (
            <li key={c.code}>
              {editing === c.code ? (
                <input
                  defaultValue={c.code}
                  autoFocus
                  onBlur={(e) => {
                    const v = e.target.value.trim().toUpperCase();
                    setEditing(null);
                    if (v && v !== c.code) void save(codes.map((x) => (x.code === c.code ? { ...x, code: v, title: `${x.title} (edited)`, confirmed: true } : x)));
                  }}
                />
              ) : (
                <code>{c.code}</code>
              )}{" "}
              {c.title}{" "}
              {c.confirmed ? (
                <span className="badge ok">{t("clin.confirmedCode")}</span>
              ) : (
                <>
                  <span className="badge draft">{DRAFT_LABEL}</span>
                  <button type="button" className="link" onClick={() => void save(codes.map((x) => (x.code === c.code ? { ...x, confirmed: true } : x)))}>
                    {t("clin.confirmCode")}
                  </button>
                </>
              )}
              <button type="button" className="link" onClick={() => setEditing(c.code)}>
                {t("clin.editCode")}
              </button>
            </li>
          ))}
        </ul>
        <h3>{t("result.note")}</h3>
        <pre className="note">{referral.note}</pre>
      </div>
    </div>
  );
}
