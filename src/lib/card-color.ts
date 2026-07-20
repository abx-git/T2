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
    swatchClass: "bg-sky-200 ring-sky-400/80",
    cardClass: "border-sky-400/80 bg-sky-100/55 ring-1 ring-sky-300/60",
  },
  {
    id: "emerald",
    label: "Grün",
    swatchClass: "bg-emerald-200 ring-emerald-400/80",
    cardClass: "border-emerald-400/80 bg-emerald-100/55 ring-1 ring-emerald-300/60",
  },
  {
    id: "amber",
    label: "Gelb",
    swatchClass: "bg-amber-200 ring-amber-400/80",
    cardClass: "border-amber-400/80 bg-amber-100/60 ring-1 ring-amber-300/60",
  },
  {
    id: "rose",
    label: "Rot",
    swatchClass: "bg-rose-200 ring-rose-400/80",
    cardClass: "border-rose-400/80 bg-rose-100/55 ring-1 ring-rose-300/60",
  },
  {
    id: "violet",
    label: "Violett",
    swatchClass: "bg-violet-200 ring-violet-400/80",
    cardClass: "border-violet-400/80 bg-violet-100/55 ring-1 ring-violet-300/60",
  },
  {
    id: "cyan",
    label: "Türkis",
    swatchClass: "bg-cyan-200 ring-cyan-400/80",
    cardClass: "border-cyan-400/80 bg-cyan-100/55 ring-1 ring-cyan-300/60",
  },
  {
    id: "orange",
    label: "Orange",
    swatchClass: "bg-orange-200 ring-orange-400/80",
    cardClass: "border-orange-400/80 bg-orange-100/55 ring-1 ring-orange-300/60",
  },
  {
    id: "slate",
    label: "Grau",
    swatchClass: "bg-slate-300 ring-slate-400/80",
    cardClass: "border-slate-400/80 bg-slate-100/55 ring-1 ring-slate-300/60",
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
