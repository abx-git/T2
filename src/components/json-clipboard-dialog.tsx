"use client";

import { useId, useLayoutEffect, useState } from "react";

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* execCommand fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export interface JsonExportPreviewDialogProps {
  open: boolean;
  title: string;
  hint?: string;
  jsonText: string;
  onClose: () => void;
}

export function JsonExportPreviewDialog({ open, title, hint, jsonText, onClose }: JsonExportPreviewDialogProps) {
  const titleId = useId();
  const areaId = useId();
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(jsonText);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      window.alert("In die Zwischenablage kopieren ist in diesem Kontext nicht möglich.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(90vh,40rem)] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <div className="min-h-0 flex-1 p-3">
          <label htmlFor={areaId} className="sr-only">
            JSON
          </label>
          <textarea
            id={areaId}
            readOnly
            value={jsonText}
            spellCheck={false}
            className="h-[min(55vh,28rem)] w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 p-3 font-mono text-[11px] leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/50"
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            {copied ? "Kopiert" : "In Zwischenablage kopieren"}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface JsonPasteImportDialogProps {
  open: boolean;
  title: string;
  hint?: string;
  onClose: () => void;
  /** Wird bei gültigem Board- oder Teilbaum-JSON aufgerufen; Dialog schließen erfolgt im Parent. */
  onApplyPastedText: (text: string) => void;
}

export function JsonPasteImportDialog({ open, title, hint, onClose, onApplyPastedText }: JsonPasteImportDialogProps) {
  const titleId = useId();
  const areaId = useId();
  const [draft, setDraft] = useState("");

  useLayoutEffect(() => {
    if (open) setDraft("");
  }, [open]);

  if (!open) return null;

  const handleApply = () => {
    onApplyPastedText(draft);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(90vh,40rem)] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <div className="min-h-0 flex-1 p-3">
          <label htmlFor={areaId} className="mb-1 block text-[11px] font-medium text-slate-500">
            Eingabefeld
          </label>
          <textarea
            id={areaId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            placeholder='{ "format": "hierarchical-task-manager", ... }'
            className="h-[min(55vh,28rem)] w-full resize-y rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/50"
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            Prüfen und importieren
          </button>
        </div>
      </div>
    </div>
  );
}
