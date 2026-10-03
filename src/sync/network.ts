// Network state for the demo: a manual On/Off toggle combined with navigator.onLine.
type Listener = () => void;

const listeners = new Set<Listener>();
let simulatedOn = readToggle();

function readToggle(): boolean {
  try {
    return globalThis.localStorage?.getItem("amara.network") !== "off";
  } catch {
    return true;
  }
}

export function isOnline(): boolean {
  const browserOnline = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  return simulatedOn && browserOnline;
}

export function simulatedNetworkOn(): boolean {
  return simulatedOn;
}

export function setSimulatedNetwork(on: boolean): void {
  simulatedOn = on;
  try {
    globalThis.localStorage?.setItem("amara.network", on ? "on" : "off");
  } catch {
    // storage unavailable: keep the in-memory value
  }
  listeners.forEach((l) => l());
}

export function onNetworkChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => listeners.forEach((l) => l()));
  window.addEventListener("offline", () => listeners.forEach((l) => l()));
}
