/** Kartenfelder außer Titel — steuern nur die Anzeige in Liste und Detail; Export/Import der Knotendaten bleibt unverändert. */
export const CARD_FIELD_KEYS = ["description", "tags", "effort", "dueDate", "reminderDate"] as const;
export type CardFieldKey = (typeof CARD_FIELD_KEYS)[number];
export type CardFieldVisibility = Record<CardFieldKey, boolean>;

export const DEFAULT_CARD_FIELD_VISIBILITY: CardFieldVisibility = {
  description: true,
  tags: true,
  effort: true,
  dueDate: true,
  reminderDate: true,
};

export const CARD_FIELD_LABELS: Record<CardFieldKey, string> = {
  description: "Beschreibung",
  tags: "Tags",
  effort: "Aufwand (inkl. Σ)",
  dueDate: "Fälligkeit / nächster Termin",
  reminderDate: "Erinnerung",
};

export function mergeCardFieldVisibility(
  partial: Partial<CardFieldVisibility> | null | undefined,
): CardFieldVisibility {
  return { ...DEFAULT_CARD_FIELD_VISIBILITY, ...partial };
}

export function parseCardFieldVisibilityFromJson(raw: unknown): CardFieldVisibility {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_CARD_FIELD_VISIBILITY };
  }
  const o = raw as Record<string, unknown>;
  const next = { ...DEFAULT_CARD_FIELD_VISIBILITY };
  for (const k of CARD_FIELD_KEYS) {
    if (typeof o[k] === "boolean") next[k] = o[k];
  }
  if (typeof o.tags !== "boolean" && typeof o.status === "boolean") {
    next.tags = o.status;
  }
  return next;
}
