import { useEffect, useState } from "react";
import { onSyncStatus, type SyncStatus } from "../sync/sync";
import { isOnline, onNetworkChange, simulatedNetworkOn } from "../sync/network";
import { demoNow, onClockChange } from "../sync/clock";

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>({ online: isOnline(), queued: 0, lastSynced: null, syncing: false });
  useEffect(() => onSyncStatus(setS), []);
  return s;
}

export function useNetwork(): { online: boolean; simulatedOn: boolean } {
  const [v, setV] = useState({ online: isOnline(), simulatedOn: simulatedNetworkOn() });
  useEffect(() => onNetworkChange(() => setV({ online: isOnline(), simulatedOn: simulatedNetworkOn() })), []);
  return v;
}

export function useDemoClock(): Date {
  const [now, setNow] = useState(demoNow());
  useEffect(() => {
    const off = onClockChange(() => setNow(demoNow()));
    const id = setInterval(() => setNow(demoNow()), 30_000);
    return () => {
      off();
      clearInterval(id);
    };
  }, []);
  return now;
}

/** Re-run a loader whenever sync status changes (new data arrived on the mock server). */
export function useLive<T>(load: () => Promise<T>, initial: T, deps: unknown[] = []): [T, () => void] {
  const [v, setV] = useState<T>(initial);
  const [tick, setTick] = useState(0);
  const status = useSyncStatus();
  useEffect(() => {
    let alive = true;
    void load().then((x) => alive && setV(x));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.lastSynced, status.queued, tick, ...deps]);
  return [v, () => setTick((n) => n + 1)];
}
