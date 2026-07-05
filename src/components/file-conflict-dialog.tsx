"use client";

import { useId } from "react";
import { createPortal } from "react-dom";

export interface FileConflictDialogProps {
  open: boolean;
  fileName: string | null;
  onLoadFile: () => void;
  onKeepLocal: () => void;
  onMerge: () => void;
  onCancel: () => void;
}

export function FileConflictDialog({
  open,
  fileName,
  onLoadFile,
  onKeepLocal,
  onMerge,
  onCancel,
}: FileConflictDialogProps) {
  const titleId = useId();
  if (!open) return null;

  const label = fileName?.trim() ? `„${fileName.trim()}“` : "die Arbeitsdatei";

  const layer = (
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md touch-manipulation rounded-t-xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          Datenkonflikt
        </h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {`Lokale Änderungen und ${label} unterscheiden sich. Nichts wird still überschrieben — bitte wählen Sie, wie fortgefahren werden soll.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onMerge}
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-950 hover:bg-sky-100"
          >
            Zusammenführen (neuer Wurzelknoten)
          </button>
          <button
            type="button"
            onClick={onKeepLocal}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Lokale Änderungen behalten (Datei überschreiben)
          </button>
          <button
            type="button"
            onClick={onLoadFile}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Datei laden (lokale Änderungen verwerfen)
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Abbrechen (nichts ändern)
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(layer, document.body) : layer;
}
