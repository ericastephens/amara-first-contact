// Display times in the device's local time zone. Stored timestamps stay ISO (UTC); only display converts.
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD HH:mm" in local time. Strings without a time zone (already local) are returned trimmed. */
export function formatLocal(value: string | Date): string {
  if (typeof value === "string" && !/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return value.replace("T", " ").slice(0, 16);
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "HH:mm" in local time. */
export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
