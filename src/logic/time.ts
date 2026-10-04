// Display times in the device's local time zone. Timestamps are stored as ISO strings (UTC, "Z");
// every place that shows one to a person goes through these helpers so the demo clock, the note
// header and the sync pill always agree.

const pad = (n: number) => String(n).padStart(2, "0");

function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** "YYYY-MM-DD" in local time. */
export function localDate(value: string | Date): string {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "HH:MM" in local time. */
export function localTime(value: string | Date): string {
  const d = toDate(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DD HH:MM" in local time. */
export function localDateTime(value: string | Date): string {
  return `${localDate(value)} ${localTime(value)}`;
}
