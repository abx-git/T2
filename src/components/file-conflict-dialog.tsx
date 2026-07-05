"use client";

import { useId } from "react";
import { createPortal } from "react-dom";

export type FileConflictChoice = "keep_local" | "load_file";

export interface FileConflictDialogProps {
  open: boolean;
  fileName: string | null;
  busy?: boolean;
  onChoose: (choice: FileConflictChoice) => void;
}

export function FileConflictDialog({
  open,
  fileName,
  busy,
  onChoose,
}: FileConflictDialogProps) {
  const titleId = useId();
  if (!open) return null;

  const label = fileName?.trim() ? `„${fileName.trim()}“` : "Ihre Datei";

  const layer = (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md touch-manipulation rounded-t-xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          Datei und T2 wurden gleichzeitig geändert
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {label} wurde von einem anderen Programm geändert, während Sie in T2 ebenfalls
          ungespeicherte Änderungen haben.
        </p>
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-500">
          <li>• <span className="text-slate-700">T2 → Datei:</span> Was Sie jetzt sehen, wird in die Datei geschrieben.</li>
          <li>• <span className="text-slate-700">Datei → T2:</span> Der Datei-Inhalt ersetzt die Anzeige in T2.</li>
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("keep_local")}
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-950 hover:bg-sky-100 disabled:opacity-60"
          >
            T2-Stand in die Datei schreiben
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("load_file")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            Datei in T2 laden
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(layer, document.body) : layer;
}
