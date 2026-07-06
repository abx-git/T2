"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { ClipboardPaste, FilePlus, FolderOpen } from "lucide-react";

export interface WorkingFileSetupDialogProps {
  open: boolean;
  mobileMode: boolean;
  fsAccessSupported: boolean;
  unavailableMessage: string;
  onPickExistingMobile: () => void;
  onPickFromDownloads: () => void;
  onPasteJson: () => void;
  lastUsedFileName?: string | null;
  onOpenExistingDesktop: () => void;
  onCreateNew: () => void;
}

export function WorkingFileSetupDialog({
  open,
  mobileMode,
  fsAccessSupported,
  unavailableMessage,
  onPickExistingMobile,
  onPickFromDownloads,
  onPasteJson,
  lastUsedFileName,
  onOpenExistingDesktop,
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
          {mobileMode
            ? "Proton Drive: Datei in der App offline verfügbar machen oder herunterladen, dann aus „Downloads“ wählen — nicht direkt aus „Proton Drive“. Alternativ JSON-Text einfügen."
            : "T2 speichert alle Daten in einer lokalen JSON-Datei. Beim nächsten Start wird dieselbe Datei automatisch wieder geöffnet."}
        </p>
        {lastUsedFileName ? (
          <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Zuletzt verwendet: <span className="font-medium text-slate-800">„{lastUsedFileName}“</span>
          </p>
        ) : null}
        {fsAccessSupported || mobileMode ? (
          <div className="mt-5 flex flex-col gap-2">
            {mobileMode ? (
              <>
                <button
                  type="button"
                  onClick={onPickExistingMobile}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-950 hover:bg-sky-100 active:bg-sky-100"
                >
                  <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
                  JSON-Datei öffnen (System)
                </button>
                <button
                  type="button"
                  onClick={onPickFromDownloads}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 active:bg-slate-50"
                >
                  <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
                  Aus Downloads / Dateien wählen
                </button>
                <button
                  type="button"
                  onClick={onPasteJson}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 active:bg-slate-50"
                >
                  <ClipboardPaste className="h-4 w-4 shrink-0" aria-hidden />
                  JSON einfügen
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenExistingDesktop}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-950 hover:bg-sky-100 active:bg-sky-100"
              >
                <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
                Bestehende Datei öffnen
              </button>
            )}
            <button
              type="button"
              onClick={onCreateNew}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 active:bg-slate-50"
            >
              <FilePlus className="h-4 w-4 shrink-0" aria-hidden />
              {mobileMode ? "Neue Datei herunterladen" : "Neue Datei anlegen"}
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
