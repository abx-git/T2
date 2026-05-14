"use client";

import { useId, useLayoutEffect, useState } from "react";

import {
  CARD_FIELD_KEYS,
  CARD_FIELD_LABELS,
  mergeCardFieldVisibility,
  type CardFieldVisibility,
} from "@/lib/card-field-visibility";

export interface CardFieldVisibilityDialogProps {
  open: boolean;
  value: CardFieldVisibility;
  effortOnTasksEnabled: boolean;
  onClose: () => void;
  onApply: (next: CardFieldVisibility, effortOnTasksEnabled: boolean) => void;
}

export function CardFieldVisibilityDialog({
  open,
  value,
  effortOnTasksEnabled,
  onClose,
  onApply,
}: CardFieldVisibilityDialogProps) {
  const titleId = useId();
  const baseId = useId();
  const [draft, setDraft] = useState<CardFieldVisibility>(() => mergeCardFieldVisibility(value));
  const [effortOn, setEffortOn] = useState(effortOnTasksEnabled);

  useLayoutEffect(() => {
    if (!open) return;
    setDraft(mergeCardFieldVisibility(value));
    setEffortOn(effortOnTasksEnabled);
  }, [open, value, effortOnTasksEnabled]);

  if (!open) return null;

  const toggle = (key: keyof CardFieldVisibility) => {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApply = () => {
    onApply(mergeCardFieldVisibility(draft), effortOn);
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
          Kartenfelder
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Steuert die Sichtbarkeit in Karten- und Detailansicht. Beim JSON-Import/Export bleiben alle Daten erhalten;
          der Titel ist immer sichtbar.
        </p>

        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
          <label htmlFor={`${baseId}-effort-global`} className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              id={`${baseId}-effort-global`}
              type="checkbox"
              checked={effortOn}
              onChange={() => setEffortOn((v) => !v)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500/40"
            />
            <span>
              <span className="font-medium">Aufwand (Stunden) an Aufgaben</span>
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                Aus: keine Eingabe und keine Anzeige von Stunden oder Summe (Σ), unabhängig von „Aufwand“ in der
                Liste unten.
              </span>
            </span>
          </label>
        </div>

        <ul className="mt-3 max-h-[min(60vh,22rem)] space-y-2 overflow-y-auto pr-0.5">
          {CARD_FIELD_KEYS.map((key) => (
            <li key={key}>
              <label
                htmlFor={`${baseId}-${key}`}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
              >
                <input
                  id={`${baseId}-${key}`}
                  type="checkbox"
                  checked={draft[key]}
                  onChange={() => toggle(key)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500/40"
                />
                <span>{CARD_FIELD_LABELS[key]}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
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
