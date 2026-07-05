"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { FilePlus, FolderOpen } from "lucide-react";

export interface WorkingFileSetupDialogProps {
  open: boolean;
  fsAccessSupported: boolean;
  unavailableMessage: string;
  onOpenExisting: () => void;
  onCreateNew: () => void;
}

export function WorkingFileSetupDialog({
  open,
  fsAccessSupported,
  unavailableMessage,
  onOpenExisting,
  onCreateNew,
}: WorkingFileSetupDialogProps) {
  const titleId = useId();
  if (!open) return null;

  const layer = (
    <div
      className="fixed inset-0 z-[1250] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
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
          Arbeitsdatei wählen
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          T2 speichert alle Daten ausschließlich in einer lokalen JSON-Datei auf Ihrem Rechner.
          Beim nächsten Start wird dieselbe Datei automatisch wieder geöffnet.
        </p>
        {fsAccessSupported ? (
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={onOpenExisting}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-950 hover:bg-sky-100"
            >
              <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
              Bestehende Datei öffnen
            </button>
            <button
              type="button"
              onClick={onCreateNew}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <FilePlus className="h-4 w-4 shrink-0" aria-hidden />
              Neue Datei anlegen
            </button>
          </div>
        ) : (
          <p className="mt-4 whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {unavailableMessage}
          </p>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(layer, document.body) : layer;
}
