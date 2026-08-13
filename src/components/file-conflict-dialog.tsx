"use client";

import { useId } from "react";
import { createPortal } from "react-dom";

export type FileConflictChoice = "keep_local" | "load_file";

export interface FileConflictDialogProps {
  open: boolean;
  fileName: string | null;
  busy?: boolean;
  onChoose: (choice: FileConflictChoice) => void;
  /** Override default copy for import/paste conflicts. */
  title?: string;
  description?: string;
  keepLocalLabel?: string;
  loadFileLabel?: string;
  /** When false, only keep-editor is offered. Default true. */
  allowLoadFile?: boolean;
}

export function FileConflictDialog({
  open,
  fileName,
  busy,
  onChoose,
  title,
  description,
  keepLocalLabel,
  loadFileLabel,
  allowLoadFile = true,
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
          {title ?? "Datei und T2 wurden gleichzeitig geändert"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {description ??
            `${label} wurde extern geändert, während Sie in T2 ungespeicherte Änderungen haben.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("keep_local")}
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-950 hover:bg-sky-100 disabled:opacity-60"
          >
            {keepLocalLabel ?? "Editor behalten (Datei-Kopie laden)"}
          </button>
          {allowLoadFile && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChoose("load_file")}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadFileLabel ?? "Datei in T2 laden"}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(layer, document.body) : layer;
}
