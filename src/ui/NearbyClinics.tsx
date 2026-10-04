// Finds real clinics around the first responder (GPS, or the place typed in setup) from OpenStreetMap,
// ranks them by distance and saves them on the phone for offline referrals.
import { useEffect, useState } from "react";
import type { Country } from "../data/schemas";
import { geocode, getRegistry, loadNearby, OSM_ATTRIBUTION, type Place, type Registry } from "../facilities/registry";
import { haversineKm } from "../logic/referral";
import type { Setup } from "../setup/setup";
import { demoToday } from "../sync/clock";
import { useI18n } from "./i18n";

type State = { kind: "loading" } | { kind: "ok"; reg: Registry } | { kind: "error"; reason: string };

export function NearbyClinics({
  setup,
  country,
  onLocated,
}: {
  setup: Partial<Setup>;
  country: Country;
  onLocated?: (p: Place) => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      try {
        let center: Place | undefined = setup.location;
        if (!center) {
          const q = [setup.district, setup.region, country.name].filter(Boolean).join(", ");
          center = await geocode(q, country.iso);
          onLocated?.(center);
        }
        const reg = await loadNearby(center, demoToday());
        if (!cancelled) setState({ kind: "ok", reg });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", reason: String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const current = getRegistry();
  return (
    <div className="nearby">
      <h2>{t("setup.clinics")}</h2>
      {state.kind === "loading" && <p className="muted">{t("setup.clinics.loading")}</p>}
      {state.kind === "ok" && (
        <>
          <p className="ok-line">
            {t("setup.clinics.ok", {
              n: state.reg.facilities.length,
              km: state.reg.radiusKm,
              from: state.reg.center.method === "gps" ? t("setup.clinics.fromgps") : state.reg.center.label,
            })}
          </p>
          <ol className="clinic-list">
            {state.reg.facilities.slice(0, 5).map((f) => (
              <li key={f.id}>
                <b>{f.name}</b>
                <span className="muted small">
                  {t(`level.${f.level}`)} · {haversineKm(state.reg.center, f).toFixed(1)} km
                </span>
              </li>
            ))}
          </ol>
          <p className="muted small">
            {OSM_ATTRIBUTION}. {t("setup.clinics.slots")}
          </p>
        </>
      )}
      {state.kind === "error" && (
        <>
          <p className="note-box amber">
            {current.source === "sample" ? t("setup.clinics.fail.sample") : t("setup.clinics.fail.cached", { n: current.facilities.length })}
          </p>
          <button type="button" className="btn secondary" onClick={() => setAttempt((a) => a + 1)}>
            {t("setup.clinics.retry")}
          </button>
        </>
      )}
    </div>
  );
}
