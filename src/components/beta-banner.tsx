"use client";

export function BetaBanner() {
  return (
    <div
      role="status"
      className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-1.5 text-center text-xs leading-relaxed text-amber-950 sm:px-6"
    >
      <span className="font-semibold">Beta</span>
      <span className="text-amber-900/90">
        {" "}
        — T2 befindet sich in aktiver Entwicklung. Funktionen und Speicherung können sich noch ändern.
      </span>
    </div>
  );
}
