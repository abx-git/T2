"use client";

import { FileStack, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

import {
  countInsertCards,
  deleteTemplate,
  getTemplatesSnapshot,
  renameTemplate,
  subscribeTemplates,
  type TemplateRecord,
} from "@/lib/templates";

export interface TemplatesSidebarProps {
  open: boolean;
  onClose: () => void;
  onInsertRequest?: (template: TemplateRecord) => void;
  onSaveAsTemplateHint?: () => void;
}

export function TemplatesSidebar({
  open,
  onClose,
  onInsertRequest,
}: TemplatesSidebarProps) {
  const templates = useSyncExternalStore(subscribeTemplates, getTemplatesSnapshot, getTemplatesSnapshot);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false),
    );
  }, [templates, query]);

  if (!open) return null;

  const startRename = (t: TemplateRecord) => {
    setRenamingId(t.id);
    setRenameDraft(t.name);
  };

  const commitRename = async () => {
    if (!renamingId) return;
    await renameTemplate(renamingId, renameDraft);
    setRenamingId(null);
  };

  return (
    <aside
      className="flex w-[min(100%,18rem)] shrink-0 flex-col border-l border-slate-200/90 bg-slate-50/80"
      aria-label="Vorlagen"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileStack className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <h2 className="truncate text-sm font-semibold text-slate-800">Vorlagen</h2>
          <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {templates.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white"
        >
          Schließen
        </button>
      </div>

      <div className="border-b border-slate-200/80 px-3 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen…"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs leading-relaxed text-slate-500">
            {templates.length === 0 ? (
              <>
                Noch keine Vorlagen.
                <span className="mt-2 block text-[11px] text-slate-400">
                  Zweig exportieren → „Als Vorlage speichern“, oder aus der Zwischenablage speichern.
                </span>
              </>
            ) : (
              "Keine Treffer."
            )}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((t) => {
              const steps = countInsertCards(t.root, "children");
              const renaming = renamingId === t.id;
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-slate-200/90 bg-white px-2.5 py-2 shadow-sm"
                >
                  {renaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitRename();
                        }
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="mb-1 w-full rounded border border-sky-200 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-sky-400/40"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onInsertRequest?.(t)}
                      className="w-full text-left"
                      title="Vorlage einfügen…"
                    >
                      <span className="block truncate text-xs font-medium text-slate-900">
                        {t.name}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {steps} Schritt{steps === 1 ? "" : "e"}
                        {t.description ? ` · ${t.description}` : ""}
                      </span>
                    </button>
                  )}
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => startRename(t)}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    >
                      <Pencil className="h-3 w-3" aria-hidden />
                      Umbenennen
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Vorlage „${t.name}“ löschen? Das betrifft die Bibliothek auf diesem Gerät.`,
                          )
                        ) {
                          void deleteTemplate(t.id);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      Löschen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
