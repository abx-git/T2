/**
 * Fälligkeit / Erinnerung: optional nur Kalendertag oder Datum mit Uhrzeit.
 * Legacy-Exporte nutzen oft 12:00 Uhr lokal als „nur Datum“.
 */

/** Nur Kalendertag (keine konkrete Uhrzeit): 00:00 oder 12:00 Uhr lokal. */
export function isDateOnlyDue(d: Date): boolean {
  const s = d.getSeconds();
  const ms = d.getMilliseconds();
  if (s !== 0 || ms !== 0) return false;
  const h = d.getHours();
  const m = d.getMinutes();
  return (h === 0 && m === 0) || (h === 12 && m === 0);
}

/** Wert für `<input type="datetime-local">` (lokale Zeitzone). */
export function toInputDateTimeLocal(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (isDateOnlyDue(d)) {
    return `${y}-${mo}-${day}T00:00`;
  }
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}`;
}

/** Aus `datetime-local`-String; leer → null. 00:00 = ganzer Tag (ohne Uhrzeit). */
export function fromInputDateTimeLocal(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const hh = Number(m[4]);
  const min = Number(m[5]);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(da) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(min)
  ) {
    return null;
  }
  return new Date(y, mo - 1, da, hh, min, 0, 0);
}
