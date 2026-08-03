"use client";

export interface DepthLevelsControlProps {
  /** Anzahl der Ebenen-Buttons (1 … maxLevel). */
  maxLevel: number;
  onApplyLevel: (level: number) => void;
  onExpandAll: () => void;
  /** Kurzes Label vor den Buttons (z. B. „Struktur“ / „Karten“). */
  label?: string;
  className?: string;
}

export function DepthLevelsControl({
  maxLevel,
  onApplyLevel,
  onExpandAll,
  label = "Ebenen",
  className = "",
}: DepthLevelsControlProps) {
  if (maxLevel <= 0) return null;

  return (
    <div
      className={[
        "flex items-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50/80 px-1 py-0.5",
        className,
      ].join(" ")}
      role="group"
      aria-label={`${label}: Ebenen zu- oder aufklappen`}
    >
      <span className="px-1 text-[10px] font-medium text-slate-500">{label}</span>
      {Array.from({ length: maxLevel }, (_, i) => i + 1).map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onApplyLevel(level)}
          className="min-w-[1.5rem] rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-600 transition hover:bg-white hover:text-slate-900"
          title={`${label}: auf ${level} Ebene${level === 1 ? "" : "n"} einklappen`}
        >
          {level}
        </button>
      ))}
      <button
        type="button"
        onClick={onExpandAll}
        className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
        title={`${label}: alle Ebenen aufklappen`}
      >
        Alle
      </button>
    </div>
  );
}
