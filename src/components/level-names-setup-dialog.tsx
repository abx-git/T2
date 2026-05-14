"use client";

import { useId, useLayoutEffect, useState } from "react";

import { defaultColumnTitle, resolveColumnDisplayTitle } from "@/lib/column-titles";

export interface LevelNamesSetupDialogProps {
  open: boolean;
  columnCount: number;
  overrides: Readonly<Record<number, string>>;
  onClose: () => void;
  onApply: (draft: string[]) => void;
}

export function LevelNamesSetupDialog({
  open,
  columnCount,
  overrides,
  onClose,
  onApply,
}: LevelNamesSetupDialogProps) {
  const titleId = useId();
  const fieldId = useId();
  const [draft, setDraft] = useState<string[]>([]);

  const count = Math.max(1, columnCount);

  useLayoutEffect(() => {
    if (!open) return;
    setDraft(
      Array.from({ length: count }, (_, i) => resolveColumnDisplayTitle(overrides, i)),
    );
  }, [open, count, overrides]);

  if (!open) return null;

  const setRow = (index: number, value: string) => {
    setDraft((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleApply = () => {
    onApply(Array.from({ length: count }, (_, i) => draft[i] ?? ""));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-sm font-semibold text-slate-900">
          Ebenen
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Namen der Spalten in der Spaltenansicht. Leer oder Standard = Vorgabe.
        </p>

        <div className="mt-3 max-h-[min(60vh,20rem)] space-y-2 overflow-y-auto pr-0.5">
          {Array.from({ length: count }, (_, i) => (
            <div key={i}>
              <label htmlFor={`${fieldId}-${i}`} className="mb-0.5 block text-[11px] font-medium text-slate-500">
                Spalte {i + 1}
                <span className="ml-1 font-normal text-slate-400">({defaultColumnTitle(i)})</span>
              </label>
              <input
                id={`${fieldId}-${i}`}
                type="text"
                value={draft[i] ?? ""}
                onChange={(e) => setRow(i, e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none ring-sky-400/80 focus:border-sky-300 focus:ring-2"
                autoComplete="off"
                maxLength={80}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
