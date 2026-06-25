"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";

import { parseBoardVaultLoxIdFromInput } from "@/lib/lox-id";
import { generateBoardLoxId } from "@/lib/server-board";

export type LoxVaultDialogMode = "create" | "connect";

export interface LoxVaultDialogProps {
  open: boolean;
  mode: LoxVaultDialogMode;
  onClose: () => void;
  onCreate: (loxId: string) => void;
  onConnect: (loxId: string) => void;
}

export function LoxVaultDialog({ open, mode, onClose, onCreate, onConnect }: LoxVaultDialogProps) {
  const [input, setInput] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCreate = () => {
    const id = generateBoardLoxId();
    setCreatedId(id);
    setCopied(false);
  };

  const handleConfirmCreate = () => {
    if (!createdId) return;
    onCreate(createdId);
    setCreatedId(null);
    setInput("");
  };

  const handleConnect = () => {
    const parsed = parseBoardVaultLoxIdFromInput(input);
    if (!parsed) {
      window.alert(
        "Ungültige Board-LOX-ID.\n\nDie vollständige ID hat das Format BRD-XXXX-XXXX (z. B. BRD-VRW5-WXYZ).\nEine gekürzte Anzeige wie „BRDV-RW5W“ reicht nicht — auf dem ersten Gerät unter „Daten“ → „ID kopieren“.",
      );
      return;
    }
    onConnect(parsed);
    setInput("");
  };

  const copyId = async () => {
    if (!createdId) return;
    try {
      await navigator.clipboard.writeText(createdId);
      setCopied(true);
    } catch {
      window.alert("Kopieren fehlgeschlagen — ID bitte manuell notieren.");
    }
  };

  const layer = (
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-t-xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {mode === "create" ? (
          <>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <KeyRound className="h-4 w-4" aria-hidden />
              Neues Server-Board
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Sie erhalten eine Board-LOX-ID. Damit wird Ihr Board verschlüsselt auf dem Server
              gespeichert — ohne die ID kein Zugriff. Die ID erscheint nie in URLs.
            </p>
            {!createdId ? (
              <button
                type="button"
                onClick={handleCreate}
                className="mt-4 w-full rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-950 hover:bg-sky-100"
              >
                LOX-ID erzeugen
              </button>
            ) : (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-amber-900">
                  Ihre Board-LOX-ID
                </p>
                <p className="mt-2 font-mono text-lg font-semibold tracking-wide text-slate-900">
                  {createdId}
                </p>
                <p className="mt-2 text-xs text-amber-900">
                  Sicher aufbewahren — Verlust bedeutet Datenverlust.
                </p>
                <button
                  type="button"
                  onClick={() => void copyId()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copied ? "Kopiert" : "ID kopieren"}
                </button>
              </div>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={!createdId}
                onClick={handleConfirmCreate}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Board anlegen &amp; verbinden
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <KeyRound className="h-4 w-4" aria-hidden />
              Mit LOX-ID verbinden
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Board-LOX-ID eingeben (z. B. BRD-XXXX-XXXX). Die ID wird nur intern verwendet, nie in
              der URL.
            </p>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="BRD-XXXX-XXXX"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase tracking-wide text-slate-900"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={!input.trim()}
                onClick={handleConnect}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Verbinden
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(layer, document.body) : layer;
}
