"use client";

import { useId, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  findTemplateByName,
  getTemplatesSnapshot,
  saveTemplateFromSubtree,
  subscribeTemplates,
  type TemplateRecord,
} from "@/lib/templates";
import type { TaskNode } from "@/types/task-node";

export interface TemplateSaveDialogProps {
  open: boolean;
  root: TaskNode | null;
  /** Vorbelegter Name (z. B. Kartentitel). */
  defaultName?: string;
  onClose: () => void;
  onSaved?: (record: TemplateRecord) => void;
}

export function TemplateSaveDialog({
  open,
  root,
  defaultName,
  onClose,
  onSaved,
}: TemplateSaveDialogProps) {
  const titleId = useId();
  const nameId = useId();
  const descId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templates = useSyncExternalStore(subscribeTemplates, getTemplatesSnapshot, getTemplatesSnapshot);

  useLayoutEffect(() => {
    if (!open) return;
    const base = (defaultName ?? root?.title ?? "").trim() || "Vorlage";
    setName(base);
    setDescription("");
    setBusy(false);
    setError(null);
  }, [open, defaultName, root]);

  const nameConflict = useMemo(() => findTemplateByName(name, templates) ?? null, [name, templates]);

  if (!open || !root) return null;

  const handleSave = async (replaceId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const record = await saveTemplateFromSubtree(root, trimmed, {
        id: replaceId,
        description: description.trim() || undefined,
      });
      onSaved?.(record);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            Als Vorlage speichern
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Der vollständige Teilbaum inkl. aller Attribute wird in der Bibliothek abgelegt und mit
            der Arbeitsdatei mitgeführt.
          </p>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div>
            <label htmlFor={nameId} className="mb-1 block text-[11px] font-medium text-slate-500">
              Name
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-400/50"
            />
          </div>
          <div>
            <label htmlFor={descId} className="mb-1 block text-[11px] font-medium text-slate-500">
              Beschreibung (optional)
            </label>
            <textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/50"
            />
          </div>
          {nameConflict ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              Es gibt bereits eine Vorlage „{nameConflict.name}“. Du kannst sie überschreiben oder
              unter neuem Namen speichern.
            </p>
          ) : null}
          {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
          {nameConflict ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSave(nameConflict.id)}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
            >
              Überschreiben
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {nameConflict ? "Als neue Vorlage" : busy ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
