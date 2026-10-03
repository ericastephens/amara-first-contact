// District surveillance: anonymous counts only (ward, syndrome, week). Map-free table + a small line
// chart per syndrome, last sync per site, and escalations that need approval.
import { rulesDoc } from "../../data";
import type { OutbreakRow } from "../../data/schemas";
import { series } from "../../logic/outbreak";
import { demoNowIso } from "../../sync/clock";
import { Card, SampleBadge } from "../common";
import { useLive } from "../hooks";
import { useI18n } from "../i18n";
import { OutbreakPanel, SiteSyncList } from "../OutbreakPanel";
import { loadOutbreakState, type OutbreakState } from "../outbreakData";

const WARD_COLORS = ["#0f5c4d", "#c2410c", "#4338ca", "#a16207", "#be185d"];

export function District() {
  const { t, pick } = useI18n();
  const [state, reload] = useLive<OutbreakState | null>(() => loadOutbreakState(demoNowIso()), null);
  if (!state) return <div className="screen">…</div>;
  const wards = [...new Set(state.rows.map((r) => r.ward))].sort();
  const weeks = [...new Set(state.rows.map((r) => r.iso_week))].sort((a, b) => a - b);
  const flagged = new Set(state.flags.map((f) => `${f.ward}|${f.syndrome}|${f.isoWeek}`));

  return (
    <div className="screen">
      <h1>{t("dist.title")}</h1>
      <p className="muted small">🔒 {t("dist.anon")}</p>
      <OutbreakPanel state={state} role="district" onChange={reload} />

      {rulesDoc.outbreak.syndromes.map((syn) => (
        <Card key={syn.id}>
          <h3>
            {pick(syn)} <SampleBadge />
          </h3>
          <LineChart rows={state.rows} syndrome={syn.id} wards={wards} weeks={weeks} />
          <div className="table-wrap">
            <table className="table counts">
              <thead>
                <tr>
                  <th>{t("dist.ward")}</th>
                  {weeks.map((w) => (
                    <th key={w}>w{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wards.map((ward, i) => (
                  <tr key={ward}>
                    <td>
                      <span className="swatch" style={{ background: WARD_COLORS[i % WARD_COLORS.length] }} />
                      {ward}
                    </td>
                    {weeks.map((w) => {
                      const r = state.rows.find((x) => x.ward === ward && x.syndrome === syn.id && x.iso_week === w);
                      return (
                        <td key={w} className={flagged.has(`${ward}|${syn.id}|${w}`) ? "flagged" : ""}>
                          {r?.count ?? 0}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <SiteSyncList state={state} />
    </div>
  );
}

function LineChart({ rows, syndrome, wards, weeks }: { rows: OutbreakRow[]; syndrome: string; wards: string[]; weeks: number[] }) {
  const W = 320;
  const H = 120;
  const pad = 22;
  const max = Math.max(3, ...rows.filter((r) => r.syndrome === syndrome).map((r) => r.count));
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, weeks.length - 1);
  const y = (v: number) => H - pad - (v * (H - pad * 2)) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Weekly cases: ${syndrome}`}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="axis" />
      <text x={4} y={y(max) + 4} className="tick">
        {max}
      </text>
      <text x={4} y={H - pad + 4} className="tick">
        0
      </text>
      {weeks.map((w, i) => (
        <text key={w} x={x(i)} y={H - 6} className="tick" textAnchor="middle">
          {w}
        </text>
      ))}
      {wards.map((ward, wi) => {
        const s = series(rows, ward, syndrome);
        const pts = weeks.map((w, i) => `${x(i)},${y(s.find((r) => r.iso_week === w)?.count ?? 0)}`).join(" ");
        return <polyline key={ward} points={pts} fill="none" stroke={WARD_COLORS[wi % WARD_COLORS.length]} strokeWidth={2} />;
      })}
    </svg>
  );
}
