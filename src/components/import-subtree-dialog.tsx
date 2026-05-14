"use client";

import { useEffect, useId, useState } from "react";

const NEW_ROOT = "__new_root__";

export interface ImportSubtreeDialogProps {
  open: boolean;
  rootTitle: string;
  parentOptions: { id: string; label: string }[];
  onCancel: () => void;
  onConfirm: (parentId: string | null) => void;
}

export function ImportSubtreeDialog({
  open,
  rootTitle,
  parentOptions,
  onCancel,
  onConfirm,
}: ImportSubtreeDialogProps) {
  const titleId = useId();
  const [parentKey, setParentKey] = useState(NEW_ROOT);

  useEffect(() => {
    if (open) setParentKey(NEW_ROOT);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          Teilbaum einfügen
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Wurzel der Importdatei: <span className="font-medium text-slate-900">„{rootTitle}“</span>
        </p>
        <label htmlFor="import-subtree-parent" className="mt-4 block text-xs font-medium text-slate-500">
          Einfügen unter
        </label>
        <select
          id="import-subtree-parent"
          value={parentKey}
          onChange={(e) => setParentKey(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-400/80"
        >
          <option value={NEW_ROOT}>Neue Wurzel (ans Ende der Hauptebene)</option>
          {parentOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[11px] text-slate-500">
          Alle Karten im Import erhalten neue IDs, damit nichts mit dem bestehenden Baum kollidiert.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onConfirm(parentKey === NEW_ROOT ? null : parentKey)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Einfügen
          </button>
        </div>
      </div>
    </div>
  );
}
