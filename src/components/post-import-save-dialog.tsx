"use client";

import { createPortal } from "react-dom";

export interface PostImportSaveDialogProps {
  open: boolean;
  workingFileAttached: boolean;
  onWriteToFile: () => void;
  onDismiss: () => void;
}

export function PostImportSaveDialog({
  open,
  workingFileAttached,
  onWriteToFile,
  onDismiss,
}: PostImportSaveDialogProps) {
  if (!open) return null;

  const layer = (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-t-xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-900">Backup eingespielt</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {workingFileAttached
            ? "Der neue Stand ist im Board sichtbar. Soll er sofort in die Arbeitsdatei geschrieben werden?"
            : "Der neue Stand ist im Board sichtbar. Bitte verknüpfen Sie eine Arbeitsdatei, um die Daten dauerhaft zu speichern."}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {workingFileAttached ? (
            <button
              type="button"
              onClick={onWriteToFile}
              className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-950 hover:bg-sky-100"
            >
              In Arbeitsdatei speichern
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            {workingFileAttached ? "Später" : "Schließen"}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(layer, document.body) : layer;
}
