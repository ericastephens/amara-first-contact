// Outbreak data for the dashboards: synthetic CSV + anonymous counts from synced encounters.
import { facilitiesDoc, outbreakRows, rulesDoc } from "../data";
import { detectOutbreaks, draftEscalation, mergeCounts, type EscalationDraft, type OutbreakFlag } from "../logic/outbreak";
import { db } from "../storage/db";
import { listCaseCounts, listServerEscalations, listSiteSync, type SiteSync } from "../sync/mockServer";
import type { OutbreakRow } from "../data/schemas";

export interface OutbreakState {
  rows: OutbreakRow[];
  flags: OutbreakFlag[];
  escalations: EscalationDraft[];
  sites: SiteSync[];
}

export async function loadOutbreakState(nowIso: string): Promise<OutbreakState> {
  const counts = await listCaseCounts();
  const rows = mergeCounts(
    outbreakRows,
    counts.map((c) => ({ ward: c.ward, syndrome: c.syndrome, count: c.count })),
  );
  const flags = detectOutbreaks(rows, rulesDoc.outbreak);
  const d = await db();
  // Every flag gets an escalation draft. It never leaves the device until a person approves it.
  for (const f of flags) {
    const reporting = facilitiesDoc.facilities.find((x) => x.ward === f.ward)?.name ?? f.ward;
    const draft = draftEscalation(f, rulesDoc.outbreak, reporting, nowIso);
    if (draft && !(await d.get("escalations", draft.id))) await d.put("escalations", draft);
  }
  const local = await d.getAll("escalations");
  const server = await listServerEscalations();
  const escalations = local.map((e) => server.find((s) => s.id === e.id) ?? e);
  return { rows, flags, escalations, sites: await listSiteSync() };
}
