// Demo clock: the demo day from slots_sample.json, the real time of day, plus an offset the
// Clinician view can advance (to show "Not arrived after 48 h" without waiting two days).
import { DEMO_TODAY } from "../data";

type Listener = () => void;
const listeners = new Set<Listener>();
let offsetHours = readOffset();

function readOffset(): number {
  try {
    return Number(globalThis.localStorage?.getItem("amara.clockOffset") ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function demoNow(): Date {
  const real = new Date();
  const d = new Date(`${DEMO_TODAY}T00:00:00`);
  d.setHours(real.getHours(), real.getMinutes(), real.getSeconds(), 0);
  return new Date(d.getTime() + offsetHours * 3600_000);
}

export function demoNowIso(): string {
  return demoNow().toISOString();
}

/** Today's date (local) as YYYY-MM-DD on the demo clock. */
export function demoToday(): string {
  const d = demoNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function clockOffsetHours(): number {
  return offsetHours;
}

export function setClockOffset(hours: number): void {
  offsetHours = hours;
  try {
    globalThis.localStorage?.setItem("amara.clockOffset", String(hours));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function onClockChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
