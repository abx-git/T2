"use client";

import { useId } from "react";
import { createPortal } from "react-dom";

export type FileConflictChoice = "keep_local" | "load_file" | "defer";

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

  const label = fileName?.trim() ? `„${fileName.trim()}“` : "die Arbeitsdatei";

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
          Unterschiedliche Stände
        </h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {`Was Sie in T2 sehen, weicht von ${label} ab. Es wird nichts automatisch überschrieben — bitte eine Option wählen.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("keep_local")}
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-950 hover:bg-sky-100 disabled:opacity-60"
          >
            Meine aktuelle Ansicht speichern
            <span className="mt-0.5 block text-xs font-normal text-sky-900/80">
              Überschreibt die Datei mit dem, was Sie jetzt in T2 sehen.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("load_file")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            Inhalt der Datei laden
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              Ersetzt die Anzeige in T2 — nicht gespeicherte Änderungen gehen verloren.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("defer")}
            className="rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Später entscheiden
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(layer, document.body) : layer;
}
