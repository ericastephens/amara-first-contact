// Outbreak watch: flag, knowledge-sharing card for nearby clinics (quoted guidance + source),
// and the escalation draft that a Clinician or District user must approve.
import { facilitiesDoc, rulesDoc } from "../data";
import { approveEscalation, clinicsToNotify, type EscalationDraft } from "../logic/outbreak";
import { db } from "../storage/db";
import { localDateTime } from "../logic/time";
import { demoNowIso } from "../sync/clock";
import { notify } from "../sync/sync";
import { Card, SampleBadge, SourceLink } from "./common";
import { useI18n } from "./i18n";
import type { OutbreakState } from "./outbreakData";

export function OutbreakPanel({ state, role, onChange }: { state: OutbreakState; role: "clinician" | "district"; onChange: () => void }) {
  const { t, lang, pick } = useI18n();
  const cfg = rulesDoc.outbreak;

  const approve = async (e: EscalationDraft) => {
    const approved = approveEscalation(e, role, demoNowIso());
    await (await db()).put("escalations", approved);
    await notify();
    onChange();
  };

  return (
    <Card>
      <h2>
        {t("clin.outbreak")} <SampleBadge />
      </h2>
      {state.flags.length === 0 && <p className="muted">{t("clin.noflags")}</p>}
      {state.flags.map((f) => {
        const syn = cfg.syndromes.find((s) => s.id === f.syndrome);
        const src = syn ? rulesDoc.sources[syn.source] : undefined;
        const clinics = clinicsToNotify(facilitiesDoc.facilities, f.ward, cfg.share_radius_km);
        const esc = state.escalations.find((e) => e.ward === f.ward && e.syndrome === f.syndrome && e.isoWeek === f.isoWeek);
        return (
          <div key={`${f.ward}-${f.syndrome}`} className="flag-card">
            <div className="row between">
              <strong>
                ⚠ {syn ? pick(syn) : f.syndrome} · {f.ward}
              </strong>
              {syn?.immediately_notifiable && <span className="badge notifiable">{t("clin.notifiable")}</span>}
            </div>
            <p className="small">
              {t("clin.week", { w: f.isoWeek })}: {t("clin.count", { n: f.count, t: f.threshold.toFixed(1) })} · baseline{" "}
              {f.baseline.join(", ")}
            </p>
            {syn && (
              <div className="knowledge">
                <p className="small muted">{t("clin.knowledge", { km: cfg.share_radius_km })}</p>
                <blockquote>{syn.guidance[lang]}</blockquote>
                {src && <SourceLink title={src.title} url={src.url} />}
                <p className="small">
                  {clinics.map((c) => `${lang === "sw" ? c.facility.name : c.facility.name_en} (${c.km.toFixed(0)} km)`).join(" · ")}
                </p>
              </div>
            )}
            {esc && (
              <div className={`escalation ${esc.status}`}>
                <h3>{t("clin.escalation")}</h3>
                <dl className="facts small">
                  <dt>Syndrome</dt>
                  <dd>{esc.syndromeName}</dd>
                  <dt>Ward</dt>
                  <dd>{esc.ward}</dd>
                  <dt>Cases</dt>
                  <dd>
                    {esc.casesThisWeek} (baseline mean {esc.baselineMean}, threshold {esc.threshold})
                  </dd>
                  <dt>Dates</dt>
                  <dd>
                    {esc.weekStart} – {esc.weekEnd} (ISO week {esc.isoWeek})
                  </dd>
                  <dt>Reporting facility</dt>
                  <dd>{esc.reportingFacility}</dd>
                </dl>
                {esc.status === "draft" ? (
                  <div className="row between">
                    <span className="badge draft">{t("clin.draft")}</span>
                    <button type="button" className="btn primary" onClick={() => void approve(esc)}>
                      {t("clin.approve")}
                    </button>
                  </div>
                ) : (
                  <p className="ok">
                    ✓ {esc.status === "sent" ? t("clin.sentDistrict") : t("clin.approved")}
                    {esc.approvedBy && ` · ${esc.approvedBy.role}`}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export function SiteSyncList({ state }: { state: OutbreakState }) {
  const { t } = useI18n();
  return (
    <Card>
      <h3>
        {t("clin.lastSynced")} <SampleBadge />
      </h3>
      <p className="small muted">{t("clin.silence")}</p>
      <table className="table">
        <tbody>
          {state.sites
            .slice()
            .sort((a, b) => a.ward.localeCompare(b.ward))
            .map((s) => (
              <tr key={s.siteId}>
                <td>{s.siteName}</td>
                <td>{s.ward}</td>
                <td className={staleClass(s.lastSynced)}>{localDateTime(s.lastSynced)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}

function staleClass(iso: string): string {
  const hours = (Date.parse(demoNowIso()) - Date.parse(iso)) / 3600_000;
  return hours > 48 ? "stale" : "";
}
