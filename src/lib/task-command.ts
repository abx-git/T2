/** Speichert/normalisiert einen Shell-Befehl (eine Zeile oder mehrzeilig). */
export function normalizeTaskCommand(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

/** `null` wenn kein Befehl gesetzt ist. */
export function getTaskCommand(raw: string | undefined | null): string | null {
  const n = normalizeTaskCommand(raw ?? "");
  return n || null;
}
