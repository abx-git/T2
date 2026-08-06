"use client";

const BETA_HINT =
  "Beta — Dateiformat kann geändert werden und inkompatibel werden.";

/** Kompakte Beta-Fahne neben dem Markennamen (kein Eck-Ribbon). */
export function BetaBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-950",
        "bg-amber-300/90 ring-1 ring-amber-400/50",
        "cursor-help select-none",
        className,
      ].join(" ")}
      title={BETA_HINT}
      aria-label={BETA_HINT}
      role="note"
      tabIndex={0}
    >
      Beta
    </span>
  );
}
