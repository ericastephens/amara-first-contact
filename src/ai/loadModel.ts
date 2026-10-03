// Loads public/models/intent_model.json. The file is precached by the service worker, so after the
// first visit this request is answered from the device cache, also in flight mode.
import type { IntentModel } from "./intent";

let cached: Promise<IntentModel> | null = null;

export function loadIntentModel(): Promise<IntentModel> {
  if (!cached) {
    cached = fetch(`${import.meta.env.BASE_URL}models/intent_model.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`intent model: HTTP ${r.status}`);
        return r.json() as Promise<IntentModel>;
      })
      .catch((err) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}
