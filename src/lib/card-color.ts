/** Vordefinierte Kartenfarben (Tailwind-Klassen). */

export const CARD_COLOR_IDS = [
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "cyan",
  "orange",
  "slate",
] as const;

export type CardColorId = (typeof CARD_COLOR_IDS)[number];

export interface CardColorOption {
  id: CardColorId;
  label: string;
  /** Vorschau-Swatch im Editor / Kontextmenü */
  swatchClass: string;
  /** Karten-Rahmen/Hintergrund wenn keine Statusfarbe aktiv ist */
  cardClass: string;
  /** Linke Akzentleiste — bleibt auch bei Statusfarben sichtbar */
  accentBarClass: string;
}

export const CARD_COLOR_OPTIONS: CardColorOption[] = [
  {
    id: "sky",
    label: "Blau",
    swatchClass: "bg-sky-400",
    cardClass: "border-sky-300 bg-sky-50",
    accentBarClass: "bg-sky-500",
  },
  {
    id: "emerald",
    label: "Grün",
    swatchClass: "bg-emerald-400",
    cardClass: "border-emerald-300 bg-emerald-50",
    accentBarClass: "bg-emerald-500",
  },
  {
    id: "amber",
    label: "Gelb",
    swatchClass: "bg-amber-400",
    cardClass: "border-amber-300 bg-amber-50",
    accentBarClass: "bg-amber-500",
  },
  {
    id: "rose",
    label: "Rot",
    swatchClass: "bg-rose-400",
    cardClass: "border-rose-300 bg-rose-50",
    accentBarClass: "bg-rose-500",
  },
  {
    id: "violet",
    label: "Violett",
    swatchClass: "bg-violet-400",
    cardClass: "border-violet-300 bg-violet-50",
    accentBarClass: "bg-violet-500",
  },
  {
    id: "cyan",
    label: "Türkis",
    swatchClass: "bg-cyan-400",
    cardClass: "border-cyan-300 bg-cyan-50",
    accentBarClass: "bg-cyan-500",
  },
  {
    id: "orange",
    label: "Orange",
    swatchClass: "bg-orange-400",
    cardClass: "border-orange-300 bg-orange-50",
    accentBarClass: "bg-orange-500",
  },
  {
    id: "slate",
    label: "Grau",
    swatchClass: "bg-slate-400",
    cardClass: "border-slate-300 bg-slate-100",
    accentBarClass: "bg-slate-500",
  },
];

const CARD_COLOR_BY_ID = Object.fromEntries(
  CARD_COLOR_OPTIONS.map((o) => [o.id, o]),
) as Record<CardColorId, CardColorOption>;

export function parseCardColor(raw: unknown): CardColorId | undefined {
  if (typeof raw !== "string") return undefined;
  return CARD_COLOR_IDS.includes(raw as CardColorId) ? (raw as CardColorId) : undefined;
}

export function cardColorClass(color: CardColorId | undefined): string | null {
  if (!color) return null;
  return CARD_COLOR_BY_ID[color]?.cardClass ?? null;
}

export function cardColorAccentClass(color: CardColorId | undefined): string | null {
  if (!color) return null;
  return CARD_COLOR_BY_ID[color]?.accentBarClass ?? null;
}
