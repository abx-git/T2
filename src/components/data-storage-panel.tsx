"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useState } from "react";
import {
  Cloud,
  Copy,
  Download,
  HardDrive,
  Link,
  Loader2,
  Route,
  Save,
  Upload,
  X,
} from "lucide-react";

import type { AutoSaveTarget } from "@/lib/storage-coordinator";
import type { VaultStatusInfo } from "@/lib/server-board";
import { formatVaultLoxIdForDisplay } from "@/lib/task-id";

export interface DataStoragePanelProps {
  open: boolean;
  onClose: () => void;
  autoSaveTarget: AutoSaveTarget;
  fsAccessSupported: boolean;
  workingFileUiReady: boolean;
  workingFileUnavailableTooltip: string;
  workingFileLabel: string | null;
  workingFileDirty: boolean;
  workingFileSaving: boolean;
  vaultStatus: VaultStatusInfo | null;
  vaultLoxId: string | null;
  serverBoardEnabled: boolean;
  serverBoardDirty: boolean;
  serverBoardSaving: boolean;
  serverOfflinePending: boolean;
  serverBoardAutoPaused: boolean;
  localMirrorHint: string | null;
  onSelectTarget: (target: AutoSaveTarget) => void;
  onAttachWorkingFile: (createNew: boolean) => void;
  onDetachWorkingFile: () => void;
  onCreateVault: () => void;
  onConnectVault: () => void;
  onDisconnectServer: () => void;
  onSaveServer: () => void;
  serverSaveError: string | null;
  onCreateBackup: () => void;
  onRestoreBackupFile: () => void;
  onRestoreBackupPaste: () => void;
  onExportMindmap: () => void;
  onShowJsonCopy: () => void;
  busy?: boolean;
}

function TargetOption({
  id,
  name,
  checked,
  disabled,
  onChange,
  title,
  description,
  children,
}: {
  id: string;
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={[
        "block rounded-lg border p-3 transition",
        checked ? "border-sky-300 bg-sky-50/50" : "border-slate-200 bg-white",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-slate-300",
      ].join(" ")}
    >
      <div className="flex gap-3">
        <input
          id={id}
          type="radio"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-slate-900">{title}</span>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{description}</p>
          {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
        </div>
      </div>
    </label>
  );
}

export function DataStoragePanel({
  open,
  onClose,
  autoSaveTarget,
  fsAccessSupported,
  workingFileUiReady,
  workingFileUnavailableTooltip,
  workingFileLabel,
  workingFileDirty,
  workingFileSaving,
  vaultStatus,
  vaultLoxId,
  serverBoardEnabled,
  serverBoardDirty,
  serverBoardSaving,
  serverOfflinePending,
  serverBoardAutoPaused,
  localMirrorHint,
  onSelectTarget,
  onAttachWorkingFile,
  onDetachWorkingFile,
  onCreateVault,
  onConnectVault,
  onDisconnectServer,
  onSaveServer,
  serverSaveError,
  onCreateBackup,
  onRestoreBackupFile,
  onRestoreBackupPaste,
  onExportMindmap,
  onShowJsonCopy,
  busy,
}: DataStoragePanelProps) {
  const [vaultIdCopied, setVaultIdCopied] = useState(false);

  if (!open) return null;

  const vaultConfigured = Boolean(vaultStatus?.configured);
  const vaultIdDisplay = vaultLoxId ? formatVaultLoxIdForDisplay(vaultLoxId) : null;

  const copyVaultLoxId = async () => {
    if (!vaultLoxId) return;
    try {
      await navigator.clipboard.writeText(vaultLoxId);
      setVaultIdCopied(true);
      window.setTimeout(() => setVaultIdCopied(false), 2000);
    } catch {
      window.alert("Kopieren fehlgeschlagen — ID bitte manuell notieren.");
    }
  };

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
              {vaultConfigured
                ? "Ein Ziel für automatisches Speichern. Server-Boards sind verschlüsselt und nur mit Ihrer LOX-ID zugänglich."
                : "Der Server liefert nur die App — Ihre Board-JSON bleibt auf Ihrem Rechner (Arbeitsdatei). Backups ersetzen bewusst den gesamten Stand."}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Wo sollen Änderungen automatisch landen?
            </h3>
            <div className="mt-3 space-y-2">
              <TargetOption
                id="storage-target-local"
                name="auto-save-target"
                checked={autoSaveTarget === "local"}
                onChange={() => onSelectTarget("local")}
                title="Nur in diesem Browser"
                description={
                  localMirrorHint
                    ? `Notfall-Kopie im Browser (${localMirrorHint}). Kein Auto-Speichern in Datei oder Server.`
                    : "Entwurf nur hier — zusätzlich eine unsichtbare Notfall-Kopie im Browser."
                }
              />

              <TargetOption
                id="storage-target-file"
                name="auto-save-target"
                checked={autoSaveTarget === "working-file"}
                disabled={!fsAccessSupported}
                onChange={() => onSelectTarget("working-file")}
                title="Arbeitsdatei (JSON)"
                description={
                  fsAccessSupported
                    ? "Eine verknüpfte Datei auf Ihrem Rechner — Änderungen werden automatisch geschrieben."
                    : workingFileUiReady
                      ? workingFileUnavailableTooltip
                      : "Browser-Unterstützung wird geprüft …"
                }
              >
                {fsAccessSupported ? (
                  autoSaveTarget === "working-file" ? (
                    <>
                      <span className="w-full text-xs text-slate-600">
                        {workingFileLabel ? `„${workingFileLabel}“` : "Verknüpft"}
                        {workingFileSaving
                          ? " — speichert …"
                          : workingFileDirty
                            ? " — ungespeichert"
                            : " — synchron"}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          onDetachWorkingFile();
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Datei trennen
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          onAttachWorkingFile(false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Link className="h-3.5 w-3.5" aria-hidden />
                        Datei öffnen
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          onAttachWorkingFile(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Neue Datei
                      </button>
                    </>
                  )
                ) : null}
              </TargetOption>

              <TargetOption
                id="storage-target-server"
                name="auto-save-target"
                checked={autoSaveTarget === "server"}
                disabled={!vaultConfigured}
                onChange={() => onSelectTarget("server")}
                title="Server (LOX-ID)"
                description={
                  vaultConfigured
                    ? "Verschlüsseltes Board auf dem Server — Zugriff nur mit Board-LOX-ID (nie in der URL)."
                    : "Nicht verfügbar (Vault-API auf dem Host oder NEXT_PUBLIC_T2_VAULT_API_URL)."
                }
              >
                {vaultConfigured ? (
                  autoSaveTarget === "server" ? (
                    <>
                      <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Board-LOX-ID (vollständig)
                        </p>
                        <p className="mt-1 break-all font-mono text-sm font-semibold tracking-wide text-slate-900">
                          {vaultIdDisplay ?? "Keine LOX-ID"}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                          {serverBoardSaving
                            ? "Speichert auf Server …"
                            : serverBoardDirty
                              ? "Ungespeichert"
                              : "Synchron"}
                        </p>
                      </div>
                      {vaultLoxId ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            void copyVaultLoxId();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          {vaultIdCopied ? "Kopiert" : "ID kopieren"}
                        </button>
                      ) : null}
                      {serverSaveError ? (
                        <span className="w-full text-xs text-red-700">{serverSaveError}</span>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || serverBoardSaving || !serverBoardDirty}
                        onClick={(e) => {
                          e.preventDefault();
                          onSaveServer();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" aria-hidden />
                        Speichern
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          onDisconnectServer();
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Vom Server trennen
                      </button>
                    </>
                  ) : serverOfflinePending ? (
                    <>
                      <span className="w-full text-xs text-amber-800">
                        {serverBoardAutoPaused
                          ? "Offline-Entwurf — Abgleich bei Netz automatisch"
                          : "Offline-Änderungen warten auf Verbindung"}
                      </span>
                      <button
                        type="button"
                        disabled={busy || !vaultLoxId}
                        onClick={(e) => {
                          e.preventDefault();
                          onConnectVault();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
                      >
                        <Cloud className="h-3.5 w-3.5" aria-hidden />
                        Mit Server verbinden
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          onCreateVault();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
                      >
                        <Cloud className="h-3.5 w-3.5" aria-hidden />
                        Neues Board
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          onConnectVault();
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Mit LOX-ID verbinden
                      </button>
                    </div>
                  )
                ) : null}
              </TargetOption>
            </div>
          </section>

          <section className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sicherung (ersetzt gesamtes Board)
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Kopien ändern weder Server noch Arbeitsdatei. Einspielen überschreibt alle Karten.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={onCreateBackup}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-white"
              >
                <Download className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                Backup erstellen (JSON)
              </button>
              <button
                type="button"
                onClick={onRestoreBackupFile}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-white"
              >
                <Upload className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                Backup einspielen (Datei …)
              </button>
              <button
                type="button"
                onClick={onRestoreBackupPaste}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-white"
              >
                <HardDrive className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                Backup einspielen (Text …)
              </button>
            </div>
          </section>

          <section className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Weitere Formate
            </h3>
            <div className="mt-3 flex flex-col gap-2">
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
