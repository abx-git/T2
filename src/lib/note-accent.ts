/** Akzentfarbe für Markdown-Notizen (Chrome, nicht Kartenfarbe). */

export const NOTE_ACCENT_IDS = [
  "steel",
  "slate",
  "sky",
  "cyan",
  "emerald",
  "amber",
  "rose",
  "violet",
] as const;

export type NoteAccentId = (typeof NOTE_ACCENT_IDS)[number];

/** Standard: dunkles Blaugrau. */
export const DEFAULT_NOTE_ACCENT: NoteAccentId = "steel";

export interface NoteAccentClasses {
  id: NoteAccentId;
  label: string;
  swatchClass: string;
  /** Kartenrahmen / Hintergrund */
  cardBorderBg: string;
  cardBorderBgNested: string;
  nestDrop: string;
  searchFocus: string;
  keyboardRing: string;
  accentBar: string;
  icon: string;
  titleHover: string;
  actionButton: string;
  listButton: string;
  outlineIcon: string;
  outlineNest: string;
  editorRing: string;
  editorPrimary: string;
  markdownBlockquote: string;
  markdownCode: string;
  markdownHr: string;
}

export const NOTE_ACCENT_OPTIONS: NoteAccentClasses[] = [
  {
    id: "steel",
    label: "Blaugrau",
    swatchClass: "bg-slate-600",
    cardBorderBg: "border-slate-400/70 bg-slate-200/45",
    cardBorderBgNested: "bg-slate-100/50",
    nestDrop: "border-slate-500 bg-slate-200/80 ring-2 ring-slate-400/60",
    searchFocus: "border-slate-500 bg-slate-100/90 ring-2 ring-slate-400/70",
    keyboardRing: "ring-2 ring-slate-400/80",
    accentBar: "bg-slate-600",
    icon: "text-slate-700",
    titleHover: "hover:text-slate-900",
    actionButton:
      "border-slate-300/90 bg-white text-slate-700 hover:bg-slate-100",
    listButton:
      "border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-200/80",
    outlineIcon: "text-slate-600",
    outlineNest: "bg-slate-100 ring-1 ring-slate-400",
    editorRing: "ring-slate-500/30",
    editorPrimary: "bg-slate-700 hover:bg-slate-800",
    markdownBlockquote: "border-slate-400",
    markdownCode: "bg-slate-200/90 text-slate-900",
    markdownHr: "border-slate-300/80",
  },
  {
    id: "slate",
    label: "Grau",
    swatchClass: "bg-slate-400",
    cardBorderBg: "border-slate-300 bg-slate-50",
    cardBorderBgNested: "bg-slate-50/70",
    nestDrop: "border-slate-400 bg-slate-100 ring-2 ring-slate-300/70",
    searchFocus: "border-slate-400 bg-slate-50 ring-2 ring-slate-300/70",
    keyboardRing: "ring-2 ring-slate-300/90",
    accentBar: "bg-slate-500",
    icon: "text-slate-600",
    titleHover: "hover:text-slate-900",
    actionButton: "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50",
    listButton:
      "border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100",
    outlineIcon: "text-slate-500",
    outlineNest: "bg-slate-50 ring-1 ring-slate-300",
    editorRing: "ring-slate-500/30",
    editorPrimary: "bg-slate-600 hover:bg-slate-700",
    markdownBlockquote: "border-slate-300",
    markdownCode: "bg-slate-100 text-slate-900",
    markdownHr: "border-slate-200/80",
  },
  {
    id: "sky",
    label: "Blau",
    swatchClass: "bg-sky-500",
    cardBorderBg: "border-sky-200/80 bg-sky-50/40",
    cardBorderBgNested: "bg-sky-50/30",
    nestDrop: "border-sky-400 bg-sky-50/90 ring-2 ring-sky-300/70",
    searchFocus: "border-sky-400 bg-sky-50/90 ring-2 ring-sky-300/70",
    keyboardRing: "ring-2 ring-sky-300/90",
    accentBar: "bg-sky-500",
    icon: "text-sky-700",
    titleHover: "hover:text-sky-900",
    actionButton: "border-sky-200/90 bg-white text-sky-700 hover:bg-sky-50",
    listButton:
      "border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100",
    outlineIcon: "text-sky-600",
    outlineNest: "bg-sky-50 ring-1 ring-sky-300",
    editorRing: "ring-sky-500/30",
    editorPrimary: "bg-sky-600 hover:bg-sky-700",
    markdownBlockquote: "border-sky-300",
    markdownCode: "bg-sky-100/90 text-sky-900",
    markdownHr: "border-sky-200/80",
  },
  {
    id: "cyan",
    label: "Türkis",
    swatchClass: "bg-cyan-500",
    cardBorderBg: "border-cyan-200/80 bg-cyan-50/40",
    cardBorderBgNested: "bg-cyan-50/30",
    nestDrop: "border-cyan-400 bg-cyan-50/90 ring-2 ring-cyan-300/70",
    searchFocus: "border-cyan-400 bg-cyan-50/90 ring-2 ring-cyan-300/70",
    keyboardRing: "ring-2 ring-cyan-300/90",
    accentBar: "bg-cyan-500",
    icon: "text-cyan-700",
    titleHover: "hover:text-cyan-900",
    actionButton: "border-cyan-200/90 bg-white text-cyan-700 hover:bg-cyan-50",
    listButton:
      "border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-medium text-cyan-800 hover:bg-cyan-100",
    outlineIcon: "text-cyan-600",
    outlineNest: "bg-cyan-50 ring-1 ring-cyan-300",
    editorRing: "ring-cyan-500/30",
    editorPrimary: "bg-cyan-600 hover:bg-cyan-700",
    markdownBlockquote: "border-cyan-300",
    markdownCode: "bg-cyan-100/90 text-cyan-900",
    markdownHr: "border-cyan-200/80",
  },
  {
    id: "emerald",
    label: "Grün",
    swatchClass: "bg-emerald-500",
    cardBorderBg: "border-emerald-200/80 bg-emerald-50/40",
    cardBorderBgNested: "bg-emerald-50/30",
    nestDrop: "border-emerald-400 bg-emerald-50/90 ring-2 ring-emerald-300/70",
    searchFocus: "border-emerald-400 bg-emerald-50/90 ring-2 ring-emerald-300/70",
    keyboardRing: "ring-2 ring-emerald-300/90",
    accentBar: "bg-emerald-500",
    icon: "text-emerald-700",
    titleHover: "hover:text-emerald-900",
    actionButton:
      "border-emerald-200/90 bg-white text-emerald-700 hover:bg-emerald-50",
    listButton:
      "border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100",
    outlineIcon: "text-emerald-600",
    outlineNest: "bg-emerald-50 ring-1 ring-emerald-300",
    editorRing: "ring-emerald-500/30",
    editorPrimary: "bg-emerald-600 hover:bg-emerald-700",
    markdownBlockquote: "border-emerald-300",
    markdownCode: "bg-emerald-100/90 text-emerald-900",
    markdownHr: "border-emerald-200/80",
  },
  {
    id: "amber",
    label: "Gelb",
    swatchClass: "bg-amber-500",
    cardBorderBg: "border-amber-200/80 bg-amber-50/40",
    cardBorderBgNested: "bg-amber-50/30",
    nestDrop: "border-amber-400 bg-amber-50/90 ring-2 ring-amber-300/70",
    searchFocus: "border-amber-400 bg-amber-50/90 ring-2 ring-amber-300/70",
    keyboardRing: "ring-2 ring-amber-300/90",
    accentBar: "bg-amber-500",
    icon: "text-amber-700",
    titleHover: "hover:text-amber-900",
    actionButton: "border-amber-200/90 bg-white text-amber-700 hover:bg-amber-50",
    listButton:
      "border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100",
    outlineIcon: "text-amber-600",
    outlineNest: "bg-amber-50 ring-1 ring-amber-300",
    editorRing: "ring-amber-500/30",
    editorPrimary: "bg-amber-600 hover:bg-amber-700",
    markdownBlockquote: "border-amber-300",
    markdownCode: "bg-amber-100/90 text-amber-900",
    markdownHr: "border-amber-200/80",
  },
  {
    id: "rose",
    label: "Rot",
    swatchClass: "bg-rose-500",
    cardBorderBg: "border-rose-200/80 bg-rose-50/40",
    cardBorderBgNested: "bg-rose-50/30",
    nestDrop: "border-rose-400 bg-rose-50/90 ring-2 ring-rose-300/70",
    searchFocus: "border-rose-400 bg-rose-50/90 ring-2 ring-rose-300/70",
    keyboardRing: "ring-2 ring-rose-300/90",
    accentBar: "bg-rose-500",
    icon: "text-rose-700",
    titleHover: "hover:text-rose-900",
    actionButton: "border-rose-200/90 bg-white text-rose-700 hover:bg-rose-50",
    listButton:
      "border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100",
    outlineIcon: "text-rose-600",
    outlineNest: "bg-rose-50 ring-1 ring-rose-300",
    editorRing: "ring-rose-500/30",
    editorPrimary: "bg-rose-600 hover:bg-rose-700",
    markdownBlockquote: "border-rose-300",
    markdownCode: "bg-rose-100/90 text-rose-900",
    markdownHr: "border-rose-200/80",
  },
  {
    id: "violet",
    label: "Violett",
    swatchClass: "bg-violet-400",
    cardBorderBg: "border-violet-200/80 bg-violet-50/40",
    cardBorderBgNested: "bg-violet-50/30",
    nestDrop: "border-violet-400 bg-violet-50/90 ring-2 ring-violet-300/70",
    searchFocus: "border-violet-400 bg-violet-50/90 ring-2 ring-violet-300/70",
    keyboardRing: "ring-2 ring-violet-300/90",
    accentBar: "bg-violet-400/80",
    icon: "text-violet-600",
    titleHover: "hover:text-violet-900",
    actionButton:
      "border-violet-200/90 bg-white text-violet-700 hover:bg-violet-50",
    listButton:
      "border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100",
    outlineIcon: "text-violet-600",
    outlineNest: "bg-violet-50 ring-1 ring-violet-300",
    editorRing: "ring-violet-500/30",
    editorPrimary: "bg-violet-600 hover:bg-violet-700",
    markdownBlockquote: "border-violet-300",
    markdownCode: "bg-violet-100/90 text-violet-900",
    markdownHr: "border-violet-200/80",
  },
];

const BY_ID = Object.fromEntries(NOTE_ACCENT_OPTIONS.map((o) => [o.id, o])) as Record<
  NoteAccentId,
  NoteAccentClasses
>;

export function parseNoteAccent(raw: unknown): NoteAccentId {
  if (typeof raw === "string" && NOTE_ACCENT_IDS.includes(raw as NoteAccentId)) {
    return raw as NoteAccentId;
  }
  return DEFAULT_NOTE_ACCENT;
}

export function noteAccentClasses(id: NoteAccentId | undefined): NoteAccentClasses {
  return BY_ID[id ?? DEFAULT_NOTE_ACCENT] ?? BY_ID[DEFAULT_NOTE_ACCENT];
}
