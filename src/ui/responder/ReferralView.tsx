// Referral created on the device: clinic, provisional slot, code, the mother's SMS in a phone mock-up
// (or a voice script), and a paper slip for no-signal cases.
import { responderSite } from "../../facilities/registry";
import { useState } from "react";
import { rulesDoc, smsDoc } from "../../data";
import { dayName, renderVoice } from "../../logic/sms";
import { motherView, urgencyLabel } from "../../logic/views";
import { db, type Referral, type SmsMessage } from "../../storage/db";
import { Card, SampleBadge, UrgencyPill, speak } from "../common";
import { useLive } from "../hooks";
import { useI18n } from "../i18n";

export function ReferralView({ referralId, onDone }: { referralId: string; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [showSlip, setShowSlip] = useState(false);
  const [data] = useLive<{ ref: Referral | undefined; sms: SmsMessage[] }>(
    async () => {
      const d = await db();
      const ref = await d.get("referrals_outbox", referralId);
      const sms = (await d.getAll("sms_outbox")).filter((m) => m.referralId === referralId);
      return { ref, sms };
    },
    { ref: undefined, sms: [] },
    [referralId],
  );
  const ref = data.ref;
  if (!ref) return <div className="screen">…</div>;

  const clinic = lang === "sw" ? ref.facilityName : ref.facilityNameEn;
  const day = ref.slot ? dayName(smsDoc, lang, ref.slot.date) : "";
  const mv = motherView(
    rulesDoc,
    { urgency: ref.urgency, fired: [], ruleOut: [], unanswered: [], facilityLevel: null },
    { clinic, date: ref.slot?.date, time: ref.slot?.time, code: ref.code, provisional: ref.slotStatus === "provisional" },
    lang,
  );
  const slotLabel =
    ref.urgency === "go_now"
      ? t("ref.slot.none")
      : ref.slot
        ? `${day} ${ref.slot.date} · ${ref.slot.time} (${t(`ref.slot.${ref.slotStatus}`)})`
        : t("ref.slot.nofree");
  const latestSms = [...data.sms].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const voiceText =
    ref.channel === "voice" && ref.slot && smsDoc.voice_scripts.referral?.[ref.lang]?.trim()
      ? renderVoice(smsDoc, "referral", ref.lang, {
          name: ref.patientName,
          clinic: ref.lang === "sw" ? ref.facilityName : ref.facilityNameEn,
          date: ref.slot.date,
          time: ref.slot.time,
          code: ref.code,
          responder: responderSite().name,
        })
      : null;

  if (showSlip) return <PaperSlip referral={ref} clinic={clinic} day={day} onClose={() => setShowSlip(false)} />;

  return (
    <div className="screen">
      {ref.urgency === "go_now" && (
        <div className="gonow" role="alert">
          <strong>{t("result.gonow.banner")}</strong>
          <span>{clinic}</span>
        </div>
      )}
      <div className="row between">
        <h1>{t("ref.title")}</h1>
        <UrgencyPill urgency={ref.urgency} label={urgencyLabel(rulesDoc, ref.urgency, lang)} />
      </div>

      <Card>
        <dl className="facts">
          <dt>{t("ref.facility")}</dt>
          <dd>
            {clinic} {ref.facilityReal ? <span className="badge ok">OpenStreetMap</span> : <SampleBadge />}
            <br />
            <span className="muted small">{t("ref.distance", { km: ref.km.toFixed(1), min: ref.walkMinutes })}</span>
          </dd>
          <dt>{t("ref.slot")}</dt>
          <dd>
            {slotLabel} {ref.slot && <SampleBadge />}
          </dd>
          <dt>{t("ref.code")}</dt>
          <dd className="code-big">{ref.code}</dd>
        </dl>
        <button type="button" className="btn secondary wide" onClick={() => setShowSlip(true)}>
          🖨 {t("ref.slip")}
        </button>
      </Card>

      <Card>
        <h2>{ref.channel === "voice" ? t("ref.voice") : t("ref.sms")}</h2>
        {latestSms.length === 0 && <p className="warn">{t("ref.noconsent")}</p>}
        {latestSms.map((m) => (
          <div key={m.id} className="phone">
            <div className="phone-screen">
              <div className="phone-from">AMARA · {m.to || "—"}</div>
              <div className="bubble">{m.text}</div>
              <div className="phone-meta">
                {m.channel === "sms" && t("ref.chars", { n: m.text.length })} ·{" "}
                {m.status === "sent" ? `✓ ${t("ref.sent")}` : `⏳ ${t("ref.queued")}`}
              </div>
            </div>
            {m.channel === "voice" && (
              <button type="button" className="btn secondary" onClick={() => speak(m.text, m.lang)}>
                ▶ {t("ref.play")}
              </button>
            )}
          </div>
        ))}
        {voiceText && latestSms.every((m) => m.channel !== "voice") && (
          <button type="button" className="btn secondary" onClick={() => speak(voiceText, ref.lang)}>
            ▶ {t("ref.play")}
          </button>
        )}
      </Card>

      <Card className="mother">
        <h2>{t("ref.mother.title")}</h2>
        <p className="big">{mv.goNow ? t("ref.mother.now") : mv.urgencyLabel}</p>
        <p>
          {t("ref.mother.go")}: <strong>{mv.clinic}</strong>
        </p>
        {mv.date && (
          <p>
            {t("ref.mother.when")}: <strong>{day} {mv.time}</strong>
          </p>
        )}
        <p>
          {t("ref.mother.code")}: <strong className="code-big">{mv.code}</strong>
        </p>
      </Card>

      <button type="button" className="btn primary wide" onClick={onDone}>
        {t("ref.done")}
      </button>
    </div>
  );
}

function PaperSlip({ referral, clinic, day, onClose }: { referral: Referral; clinic: string; day: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="screen slip-screen">
      <div className="slip">
        <div className="slip-title">AMARA · {t("result.paper").toUpperCase()}</div>
        <div className="slip-code">{referral.code}</div>
        <div className="slip-clinic">{clinic}</div>
        <div className="slip-when">
          {referral.urgency === "go_now" ? t("ref.mother.now") : referral.slot ? `${day} ${referral.slot.date} · ${referral.slot.time}` : "—"}
        </div>
        <div className="slip-foot">{referral.createdAt.slice(0, 10)}</div>
      </div>
      <div className="nav no-print">
        <button type="button" className="btn secondary" onClick={onClose}>
          {t("back")}
        </button>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          {t("ref.slip.print")}
        </button>
      </div>
    </div>
  );
}
