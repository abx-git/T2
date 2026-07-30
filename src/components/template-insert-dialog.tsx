"use client";

import { useId, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  countInsertCards,
  getTemplatesSnapshot,
  subscribeTemplates,
  templateOutlineLines,
  type TemplateInsertMode,
  type TemplateRecord,
} from "@/lib/templates";

export interface TemplateInsertDialogProps {
  open: boolean;
  parentTitle?: string;
  /** Vorausgewählte Vorlage (z. B. aus der Seitenleiste). */
  initialTemplateId?: string | null;
  onClose: () => void;
  onInsert: (template: TemplateRecord, mode: TemplateInsertMode) => void;
}

const MODE_LABELS: Record<TemplateInsertMode, string> = {
  children: "Direkte Unterkarten",
  wrapper: "Mit Wurzelkarte",
};

export function TemplateInsertDialog({
  open,
  parentTitle,
  initialTemplateId = null,
  onClose,
  onInsert,
}: TemplateInsertDialogProps) {
  const titleId = useId();
  const searchId = useId();
  const templates = useSyncExternalStore(subscribeTemplates, getTemplatesSnapshot, getTemplatesSnapshot);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<TemplateInsertMode>("children");

  useLayoutEffect(() => {
    if (!open) return;
    setQuery("");
    setMode("children");
    const preferred =
      (initialTemplateId && templates.some((t) => t.id === initialTemplateId)
        ? initialTemplateId
        : null) ??
      templates[0]?.id ??
      null;
    setSelectedId(preferred);
  }, [open, templates, initialTemplateId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false),
    );
  }, [templates, query]);

  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  if (!open) return null;

  const parentLabel = parentTitle?.trim() || "Karte";
  const insertCount = selected ? countInsertCards(selected.root, mode) : 0;
  const outline = selected ? templateOutlineLines(selected.root, mode) : [];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92vh,40rem)] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            Vorlage einfügen
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Unter „{parentLabel}“ — Checkliste aus der Bibliothek wählen und Umfang festlegen.
          </p>
          <label htmlFor={searchId} className="sr-only">
            Vorlagen suchen
          </label>
          <input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen…"
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400/50"
          />
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Einfügeumfang">
            {(Object.keys(MODE_LABELS) as TemplateInsertMode[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={[
                  "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition",
                  mode === key
                    ? "border-sky-300 bg-sky-50 text-sky-900"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {MODE_LABELS[key]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            {mode === "children"
              ? "Schritte der Vorlage werden direkte Unterkarten (ohne Extra-Wurzel)."
              : "Die Vorlagen-Wurzel inkl. aller Schritte wird als eine Unterkarte eingefügt."}
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 sm:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-b border-slate-100 p-2 sm:border-b-0 sm:border-r">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-500">
                {templates.length === 0
                  ? "Noch keine Vorlagen. Exportiere einen Zweig und speichere ihn als Vorlage."
                  : "Keine Treffer."}
              </p>
            ) : (
              <ul className="space-y-1" role="listbox" aria-label="Vorlagen">
                {filtered.map((t) => {
                  const active = selected?.id === t.id;
                  const steps = countInsertCards(t.root, "children");
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => setSelectedId(t.id)}
                        className={[
                          "w-full rounded-lg px-3 py-2 text-left transition",
                          active ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <span className="block truncate text-xs font-medium text-slate-900">
                          {t.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-500">
                          {steps} Schritt{steps === 1 ? "" : "e"}
                          {t.description ? ` · ${t.description}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="min-h-0 overflow-y-auto p-3">
            <p className="text-[11px] font-medium text-slate-500">Vorschau</p>
            {selected ? (
              <>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-700">
                  {outline.join("\n")}
                </pre>
                <p className="mt-3 text-[10px] text-slate-500">
                  Es werden {insertCount} Karte{insertCount === 1 ? "" : "n"} eingefügt.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Keine Vorlage gewählt.</p>
            )}
          </div>
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
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onInsert(selected, mode);
              onClose();
            }}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Einfügen
          </button>
        </div>
      </div>
    </div>
  );
}
