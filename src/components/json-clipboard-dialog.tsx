"use client";

import { useId, useLayoutEffect, useMemo, useState } from "react";

import {
  branchExportFilename,
  DEFAULT_SUBTREE_EXPORT_ATTRIBUTES,
  exportSubtreeBranch,
  mergeSubtreeExportAttributes,
  SUBTREE_EXPORT_ATTRIBUTE_KEYS,
  SUBTREE_EXPORT_ATTRIBUTE_LABELS,
  type BranchExportFormat,
  type BranchExportScope,
  type SubtreeExportAttributeKey,
  type SubtreeExportAttributes,
} from "@/lib/subtree-branch-export";
import { downloadJsonFile, downloadTextFile } from "@/lib/task-tree-json";
import type { TaskNode } from "@/types/task-node";

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

export interface TextExportPreviewDialogProps {
  open: boolean;
  title: string;
  hint?: string;
  text: string;
  /** Beschriftung für Screenreader (z. B. „JSON“, „Markdown“). */
  contentLabel?: string;
  /** Monospace-Darstellung (JSON); sonst normaler Fließtext. */
  monospace?: boolean;
  onClose: () => void;
}

export function TextExportPreviewDialog({
  open,
  title,
  hint,
  text,
  contentLabel = "Exporttext",
  monospace = true,
  onClose,
}: TextExportPreviewDialogProps) {
  const titleId = useId();
  const areaId = useId();
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(text);
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
            {contentLabel}
          </label>
          <textarea
            id={areaId}
            readOnly
            value={text}
            spellCheck={false}
            className={[
              "h-[min(55vh,28rem)] w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-[11px] leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/50",
              monospace ? "font-mono" : "font-sans whitespace-pre-wrap",
            ].join(" ")}
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

export interface JsonExportPreviewDialogProps {
  open: boolean;
  title: string;
  hint?: string;
  jsonText: string;
  onClose: () => void;
}

export function JsonExportPreviewDialog({ open, title, hint, jsonText, onClose }: JsonExportPreviewDialogProps) {
  return (
    <TextExportPreviewDialog
      open={open}
      title={title}
      hint={hint}
      text={jsonText}
      contentLabel="JSON"
      monospace
      onClose={onClose}
    />
  );
}

const BRANCH_FORMAT_LABELS: Record<BranchExportFormat, string> = {
  markdown: "Markdown (Überschriften)",
  json: "JSON",
};

const BRANCH_SCOPE_LABELS: Record<BranchExportScope, string> = {
  card: "Nur diese Karte",
  subtree: "Zweig inkl. Unterkarten",
};

export interface BranchExportDialogProps {
  open: boolean;
  root: TaskNode | null;
  completedTag: string;
  effortOnTasksEnabled: boolean;
  onClose: () => void;
  /** Öffnet Speichern-als-Vorlage (voller Teilbaum, unabhängig vom Attributfilter). */
  onSaveAsTemplate?: (root: TaskNode) => void;
}

export function BranchExportDialog({
  open,
  root,
  completedTag,
  effortOnTasksEnabled,
  onClose,
  onSaveAsTemplate,
}: BranchExportDialogProps) {
  const titleId = useId();
  const areaId = useId();
  const [format, setFormat] = useState<BranchExportFormat>("markdown");
  const [scope, setScope] = useState<BranchExportScope>("subtree");
  const [attributes, setAttributes] = useState<SubtreeExportAttributes>(() => ({
    ...DEFAULT_SUBTREE_EXPORT_ATTRIBUTES,
  }));
  const [jsonImportCompatible, setJsonImportCompatible] = useState(false);
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setFormat("markdown");
      setScope("subtree");
      setAttributes({ ...DEFAULT_SUBTREE_EXPORT_ATTRIBUTES });
      setJsonImportCompatible(false);
      setCopied(false);
      return;
    }
    if (root) {
      setScope(root.children.length > 0 ? "subtree" : "card");
    }
  }, [open, root]);

  const exportText = useMemo(() => {
    if (!root) return "";
    return exportSubtreeBranch(root, {
      format,
      scope,
      attributes: mergeSubtreeExportAttributes(attributes),
      completedTag,
      effortOnTasksEnabled,
      jsonImportCompatible: format === "json" && jsonImportCompatible,
    }, { sourceNodeTitle: root.title });
  }, [root, format, scope, attributes, completedTag, effortOnTasksEnabled, jsonImportCompatible]);

  if (!open || !root) return null;

  const rootTitle = root.title.trim() || "(Ohne Titel)";
  const contentLabel = format === "json" ? "JSON" : "Markdown";
  const monospace = format === "json";
  const attrPickerDisabled = format === "json" && jsonImportCompatible;
  const hasChildren = root.children.length > 0;

  const toggleAttr = (key: SubtreeExportAttributeKey) => {
    if (key === "title") return;
    setAttributes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(exportText);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      window.alert("In die Zwischenablage kopieren ist in diesem Kontext nicht möglich.");
    }
  };

  const handleDownload = () => {
    const filename = branchExportFilename(root, format, scope);
    if (format === "json") {
      downloadJsonFile(filename, exportText);
    } else {
      downloadTextFile(filename, exportText, "text/markdown");
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
        className="flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            Exportieren
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            „{rootTitle}“ — Umfang, Format und Felder wählen; kopieren oder als Datei speichern.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Exportumfang">
            {(Object.keys(BRANCH_SCOPE_LABELS) as BranchExportScope[]).map((key) => (
              <button
                key={key}
                type="button"
                disabled={key === "subtree" && !hasChildren}
                onClick={() => setScope(key)}
                className={[
                  "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                  scope === key
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {BRANCH_SCOPE_LABELS[key]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Exportformat">
            {(Object.keys(BRANCH_FORMAT_LABELS) as BranchExportFormat[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setFormat(key);
                  if (key === "markdown") setJsonImportCompatible(false);
                }}
                className={[
                  "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition",
                  format === key
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {BRANCH_FORMAT_LABELS[key]}
              </button>
            ))}
          </div>
          {format === "markdown" ? (
            <p className="mt-2 text-[10px] text-slate-500">
              Hierarchie über Überschriften (# bis ######); Link im Titel als Markdown-Link, weitere Felder als
              Aufzählung.
            </p>
          ) : (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={jsonImportCompatible}
                onChange={(e) => setJsonImportCompatible(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30"
              />
              Import-kompatibles Teilbaum-JSON (alle Felder, erneuter Import in T2)
            </label>
          )}
          <div
            className={[
              "mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3",
              attrPickerDisabled ? "pointer-events-none opacity-50" : "",
            ].join(" ")}
            role="group"
            aria-label="Exportierte Attribute"
          >
            {SUBTREE_EXPORT_ATTRIBUTE_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600"
              >
                <input
                  type="checkbox"
                  checked={attributes[key]}
                  disabled={key === "title" || attrPickerDisabled}
                  onChange={() => toggleAttr(key)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30 disabled:opacity-60"
                />
                {SUBTREE_EXPORT_ATTRIBUTE_LABELS[key]}
              </label>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 p-3">
          <label htmlFor={areaId} className="sr-only">
            {contentLabel}
          </label>
          <textarea
            id={areaId}
            readOnly
            value={exportText}
            spellCheck={false}
            className={[
              "h-[min(42vh,22rem)] w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-[11px] leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/50",
              monospace ? "font-mono" : "font-sans whitespace-pre-wrap",
            ].join(" ")}
          />
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Schließen
          </button>
          {onSaveAsTemplate ? (
            <button
              type="button"
              onClick={() => onSaveAsTemplate(root)}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
            >
              Als Vorlage speichern
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Als Datei speichern
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

/** @deprecated Nutze {@link BranchExportDialog}. */
export const SubtreeCopyDialog = BranchExportDialog;

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
