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
  /** Vorschau-Swatch im Editor */
  swatchClass: string;
  /** Karten-Rahmen/Hintergrund wenn keine Statusfarbe aktiv ist */
  cardClass: string;
}

export const CARD_COLOR_OPTIONS: CardColorOption[] = [
  {
    id: "sky",
    label: "Blau",
    swatchClass: "bg-sky-100 ring-sky-300/80",
    cardClass: "border-sky-300/80 bg-sky-50/50 ring-1 ring-sky-200/60",
  },
  {
    id: "emerald",
    label: "Grün",
    swatchClass: "bg-emerald-100 ring-emerald-300/80",
    cardClass: "border-emerald-300/80 bg-emerald-50/50 ring-1 ring-emerald-200/60",
  },
  {
    id: "amber",
    label: "Gelb",
    swatchClass: "bg-amber-100 ring-amber-300/80",
    cardClass: "border-amber-300/80 bg-amber-50/50 ring-1 ring-amber-200/60",
  },
  {
    id: "rose",
    label: "Rot",
    swatchClass: "bg-rose-100 ring-rose-300/80",
    cardClass: "border-rose-300/80 bg-rose-50/50 ring-1 ring-rose-200/60",
  },
  {
    id: "violet",
    label: "Violett",
    swatchClass: "bg-violet-100 ring-violet-300/80",
    cardClass: "border-violet-300/80 bg-violet-50/50 ring-1 ring-violet-200/60",
  },
  {
    id: "cyan",
    label: "Türkis",
    swatchClass: "bg-cyan-100 ring-cyan-300/80",
    cardClass: "border-cyan-300/80 bg-cyan-50/50 ring-1 ring-cyan-200/60",
  },
  {
    id: "orange",
    label: "Orange",
    swatchClass: "bg-orange-100 ring-orange-300/80",
    cardClass: "border-orange-300/80 bg-orange-50/50 ring-1 ring-orange-200/60",
  },
  {
    id: "slate",
    label: "Grau",
    swatchClass: "bg-slate-200 ring-slate-300/80",
    cardClass: "border-slate-300/80 bg-slate-50/80 ring-1 ring-slate-200/60",
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
