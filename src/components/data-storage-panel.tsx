"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Link, Loader2, Route, Upload, X } from "lucide-react";

export interface DataStoragePanelProps {
  open: boolean;
  onClose: () => void;
  fsAccessSupported: boolean;
  workingFileUiReady: boolean;
  workingFileUnavailableTooltip: string;
  workingFileLabel: string | null;
  workingFileAttached: boolean;
  workingFileDirty: boolean;
  workingFileSaving: boolean;
  onOpenWorkingFile: () => void;
  onCreateWorkingFile: () => void;
  onChangeWorkingFile: () => void;
  mobileWorkingFileMode?: boolean;
  onExportWorkingFileForSync?: () => void;
  onCreateBackup: () => void;
  onRestoreBackupFile: () => void;
  onRestoreBackupPaste: () => void;
  onExportMindmap: () => void;
  onShowJsonCopy: () => void;
  busy?: boolean;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function DataStoragePanel({
  open,
  onClose,
  fsAccessSupported,
  workingFileUiReady,
  workingFileUnavailableTooltip,
  workingFileLabel,
  workingFileAttached,
  workingFileDirty,
  workingFileSaving,
  onOpenWorkingFile,
  onCreateWorkingFile,
  onChangeWorkingFile,
  mobileWorkingFileMode,
  onExportWorkingFileForSync,
  onCreateBackup,
  onRestoreBackupFile,
  onRestoreBackupPaste,
  onExportMindmap,
  onShowJsonCopy,
  busy,
}: DataStoragePanelProps) {
  if (!open) return null;

  const layer = (
    <div
      className="fixed inset-0 z-[1100] flex justify-end bg-slate-900/40 backdrop-blur-sm"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-storage-panel-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="data-storage-panel-title" className="text-base font-semibold text-slate-900">
              Daten &amp; Speicher
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {mobileWorkingFileMode
                ? "Auf dem Handy werden Änderungen lokal gespeichert. Zum Abgleich mit Proton Drive die Datei exportieren und im Sync-Ordner ersetzen."
                : "Alle Daten liegen in einer lokalen JSON-Datei. Änderungen werden sofort geschrieben und externe Dateiänderungen automatisch erkannt."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-8">
          <Section title="Arbeitsdatei">
            {fsAccessSupported ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                {workingFileAttached ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-800">
                      {workingFileLabel ? `„${workingFileLabel}“` : "Verknüpft"}
                      {workingFileSaving
                        ? " — speichert …"
                        : workingFileDirty
                          ? " — ungespeichert"
                          : " — synchron"}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        onChangeWorkingFile();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Link className="h-3.5 w-3.5" aria-hidden />
                      Andere Datei wählen
                    </button>
                    {mobileWorkingFileMode && onExportWorkingFileForSync ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          onExportWorkingFileForSync();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        Für Proton Drive exportieren
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        onOpenWorkingFile();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
                    >
                      <Link className="h-3.5 w-3.5" aria-hidden />
                      Datei öffnen
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        onCreateWorkingFile();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Neue Datei
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-slate-600">
                {workingFileUiReady ? workingFileUnavailableTooltip : "Browser-Unterstützung wird geprüft …"}
              </p>
            )}
          </Section>

          <Section title="Backup &amp; Import">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  onCreateBackup();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Backup erstellen (JSON)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  onRestoreBackupFile();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                Backup einspielen (Datei)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  onRestoreBackupPaste();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Backup einspielen (Text)
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Import ersetzt den Board-Stand. Bei Konflikten mit der Arbeitsdatei werden Sie gefragt.
            </p>
          </Section>

          <Section title="Weitere Formate">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onExportMindmap}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Route className="h-4 w-4 shrink-0" aria-hidden />
                Mindmap exportieren (.mm)
              </button>
              <button
                type="button"
                onClick={onShowJsonCopy}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-4 w-4 shrink-0" aria-hidden />
                JSON anzeigen / kopieren
              </button>
            </div>
          </Section>
        </div>

        {busy ? (
          <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Bitte warten …
          </div>
        ) : null}
      </aside>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(layer, document.body) : layer;
}
