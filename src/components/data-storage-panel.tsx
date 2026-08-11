"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Clock,
  Copy,
  Download,
  FileCode2,
  FolderOpen,
  Link,
  Loader2,
  Route,
  Save,
  Upload,
  X,
} from "lucide-react";

import { formatAppVersionLabel } from "@/lib/app-version";
import {
  BACKUP_INTERVAL_OPTIONS_MINUTES,
  listLocalBackups,
  type BackupHistoryMode,
  type BackupIntervalMinutes,
  type LocalBackupListItem,
} from "@/lib/board-backup";
import { listRecentWorkingFiles } from "@/lib/working-file";

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
  mustSaveBeforeOpen?: boolean;
  backupIntervalMinutes: BackupIntervalMinutes;
  backupHistoryMode: BackupHistoryMode;
  backupLastLabel: string;
  onBackupIntervalChange: (minutes: BackupIntervalMinutes) => void;
  onBackupHistoryModeChange: (mode: BackupHistoryMode) => void;
  onBackupNow: () => void;
  onOpenWorkingFile: () => void;
  onCreateWorkingFile: () => void;
  onChangeWorkingFile: () => void;
  onSaveWorkingFileAs?: () => void;
  onOpenRecentWorkingFile?: (handle: FileSystemFileHandle) => void;
  onOpenLocalBackup?: (backupId: string) => void;
  mobileWorkingFileMode?: boolean;
  onExportWorkingFileForSync?: () => void;
  onRestoreBackupFile: () => void;
  onRestoreBackupPaste: () => void;
  onExportMindmap: () => void;
  onShowJsonCopy: () => void;
  onExportSchema: () => void;
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

function ActionButton({
  onClick,
  disabled,
  children,
  emphasize,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50",
        emphasize
          ? "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100"
          : "border-slate-200 text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
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
  mustSaveBeforeOpen = false,
  backupIntervalMinutes,
  backupHistoryMode,
  backupLastLabel,
  onBackupIntervalChange,
  onBackupHistoryModeChange,
  onBackupNow,
  onOpenWorkingFile,
  onCreateWorkingFile,
  onChangeWorkingFile,
  onSaveWorkingFileAs,
  onOpenRecentWorkingFile,
  onOpenLocalBackup,
  mobileWorkingFileMode,
  onExportWorkingFileForSync,
  onRestoreBackupFile,
  onRestoreBackupPaste,
  onExportMindmap,
  onShowJsonCopy,
  onExportSchema,
  busy,
}: DataStoragePanelProps) {
  const [recentFiles, setRecentFiles] = useState<
    Array<{ name: string; openedAt: number; handle: FileSystemFileHandle }>
  >([]);
  const [localBackups, setLocalBackups] = useState<LocalBackupListItem[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (fsAccessSupported) {
      void listRecentWorkingFiles().then((entries) => {
        if (!cancelled) setRecentFiles(entries);
      });
    }
    void listLocalBackups().then((entries) => {
      if (!cancelled) setLocalBackups(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [open, fsAccessSupported, workingFileLabel, busy, backupLastLabel]);

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
              <div className="space-y-3">
                {workingFileAttached ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
                    <p className="text-sm text-slate-800">
                      {workingFileLabel ? `„${workingFileLabel}“` : "Verknüpft"}
                      {workingFileSaving
                        ? " — speichert …"
                        : workingFileDirty
                          ? " — ungespeichert"
                          : " — synchron"}
                    </p>
                    {mustSaveBeforeOpen ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                        Ungespeichert — zuerst speichern, bevor du eine andere Datei oder ein Backup
                        öffnest.
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          onChangeWorkingFile();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Link className="h-3.5 w-3.5" aria-hidden />
                        Andere Datei wählen
                      </button>
                      {onSaveWorkingFileAs ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            onSaveWorkingFileAs();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" aria-hidden />
                          Speichern unter…
                        </button>
                      ) : null}
                      {mobileWorkingFileMode && onExportWorkingFileForSync ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            onExportWorkingFileForSync();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />
                          Für Proton Drive exportieren
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mustSaveBeforeOpen ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                        Board noch nicht gesichert — zuerst „Speichern unter…“ oder „Neue Datei“,
                        bevor du eine andere Datei öffnest.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {onSaveWorkingFileAs ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            onSaveWorkingFileAs();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" aria-hidden />
                          Speichern unter…
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || mustSaveBeforeOpen}
                        onClick={(e) => {
                          e.preventDefault();
                          onOpenWorkingFile();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Neue Datei
                      </button>
                    </div>
                  </div>
                )}
                {fsAccessSupported && recentFiles.length > 0 && onOpenRecentWorkingFile ? (
                  <div className="space-y-1.5">
                    <p className="text-[0.7rem] font-medium text-slate-500">
                      Zuletzt verwendet
                      {mustSaveBeforeOpen ? " — erst speichern" : ""}
                    </p>
                    <ul className="space-y-1">
                      {recentFiles.map((entry) => (
                        <li key={`${entry.name}-${entry.openedAt}`}>
                          <button
                            type="button"
                            disabled={busy || mustSaveBeforeOpen}
                            onClick={() => onOpenRecentWorkingFile(entry.handle)}
                            className="flex w-full items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            title={new Date(entry.openedAt).toLocaleString("de-DE")}
                          >
                            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{entry.name}</span>
                              <span className="block text-[0.65rem] text-slate-500">
                                {new Date(entry.openedAt).toLocaleString("de-DE")}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-slate-600">
                {workingFileUiReady ? workingFileUnavailableTooltip : "Browser-Unterstützung wird geprüft …"}
              </p>
            )}
          </Section>

          <Section title="Backup &amp; Import">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500">
                {backupHistoryMode === "rolling"
                  ? "Ohne Historie: immer dieselbe Backup-Datei überschreiben (bei File-System-API) bzw. fester Dateiname."
                  : "Mit Historie: zeitgestempelte .json-Kopien."}{" "}
                Unabhängig von der Arbeitsdatei. {backupLastLabel}.
              </p>
              <ActionButton onClick={onBackupNow} disabled={busy}>
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Jetzt sichern
              </ActionButton>
              <ActionButton
                onClick={onRestoreBackupFile}
                disabled={busy || mustSaveBeforeOpen}
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                Backup-Datei öffnen
              </ActionButton>
              <ActionButton
                onClick={onRestoreBackupPaste}
                disabled={busy || mustSaveBeforeOpen}
              >
                Backup einspielen (Text)
              </ActionButton>
              {localBackups.length > 0 && onOpenLocalBackup ? (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[0.7rem] font-medium text-slate-500">
                    Gesicherte Backups
                    {mustSaveBeforeOpen ? " — erst speichern" : ""}
                  </p>
                  <ul className="space-y-1">
                    {localBackups.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          disabled={busy || mustSaveBeforeOpen}
                          onClick={() => onOpenLocalBackup(entry.id)}
                          className="flex w-full items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          title={new Date(entry.createdAt).toLocaleString("de-DE")}
                        >
                          <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{entry.filename}</span>
                            <span className="block text-[0.65rem] text-slate-500">
                              {new Date(entry.createdAt).toLocaleString("de-DE")}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <label className="flex flex-col gap-1 pt-1 text-xs text-slate-700">
                <span className="text-slate-500">Historie</span>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={backupHistoryMode}
                  onChange={(e) =>
                    onBackupHistoryModeChange(e.target.value as BackupHistoryMode)
                  }
                >
                  <option value="history">Mit Historie (neue Datei je Backup)</option>
                  <option value="rolling">Ohne Historie (gleiche Datei überschreiben)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 pt-1 text-xs text-slate-700">
                <span className="text-slate-500">Automatisch alle …</span>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  value={backupIntervalMinutes}
                  onChange={(e) =>
                    onBackupIntervalChange(Number(e.target.value) as BackupIntervalMinutes)
                  }
                >
                  {BACKUP_INTERVAL_OPTIONS_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "Aus" : `${m} Minuten`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Import ersetzt den Board-Stand. Vor dem Ersetzen wird ein Sicherheits-Backup
              angelegt. Bei Konflikten mit der Arbeitsdatei werden Sie gefragt.
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
              <button
                type="button"
                onClick={onExportSchema}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <FileCode2 className="h-4 w-4 shrink-0" aria-hidden />
                Schema exportieren (.json)
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Das Schema beschreibt die Struktur der Arbeitsdatei bzw. von Board-/Teilbaum-Exporten.
            </p>
          </Section>

          <section className="border-t border-slate-100 pt-6">
            <p className="text-xs text-slate-500">{formatAppVersionLabel()}</p>
          </section>
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
