"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";

import { mergeCardFieldVisibility } from "@/lib/card-field-visibility";
import { findNodeById } from "@/lib/tree-utils";
import { DONE_TAG_DISPLAY, uniqNonEmptyTags } from "@/lib/task-tags";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskCardEditableFields, TaskNode } from "@/types/task-node";

function toInputDate(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromInputDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const [y, mo, da] = t.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return null;
  return new Date(y, mo - 1, da, 12, 0, 0, 0);
}

function splitTagInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export interface TaskEditorDialogProps {
  open: boolean;
  nodeId: string | null;
  onClose: () => void;
  onSave: (nodeId: string, fields: TaskCardEditableFields) => void;
}

export function TaskEditorDialog({ open, nodeId, onClose, onSave }: TaskEditorDialogProps) {
  const roots = useTaskTreeStore((s) => s.roots);
  const cardFieldVisibility = useTaskTreeStore((s) => s.cardFieldVisibility);
  const effortOnTasksEnabled = useTaskTreeStore((s) => s.effortOnTasksEnabled);
  const v = mergeCardFieldVisibility(cardFieldVisibility);
  const node = nodeId ? findNodeById(roots, nodeId) : null;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [effort, setEffort] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [reminderDate, setReminderDate] = useState("");

  useEffect(() => {
    if (!open || !node) return;
    setTitle(node.title);
    setDescription(node.description);
    setTags([...node.tags]);
    setTagDraft("");
    setEffort(node.effort);
    setDueDate(toInputDate(node.dueDate));
    setReminderDate(toInputDate(node.reminderDate));
  }, [open, node]);

  if (!open || !nodeId) return null;
  if (!node) {
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
          <p className="text-sm text-slate-600">Karte nicht gefunden.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
          >
            Schließen
          </button>
        </div>
      </div>
    );
  }

  const addTagsFromDraft = () => {
    const next = splitTagInput(tagDraft);
    if (!next.length) return;
    setTags(uniqNonEmptyTags([...tags, ...next]));
    setTagDraft("");
  };

  const onTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTagsFromDraft();
    }
  };

  const removeTag = (t: string) => {
    setTags(tags.filter((x) => x !== t));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave(node.id, {
      title: title.trim(),
      description: description.trim(),
      tags: uniqNonEmptyTags(tags),
      effort: effortOnTasksEnabled && Number.isFinite(effort) && effort >= 0 ? effort : 0,
      dueDate: fromInputDate(dueDate),
      reminderDate: fromInputDate(reminderDate),
    });
    onClose();
  };

  const showEffortField = effortOnTasksEnabled && v.effort;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="task-editor-title" className="text-lg font-semibold text-slate-900">
          Karte bearbeiten
        </h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Titel darf leer sein. Tag „{DONE_TAG_DISPLAY}“ blendet die Karte bei aktivem Filter aus.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="task-title" className="block text-xs font-medium text-slate-600">
              Titel
            </label>
            <input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
              placeholder="(optional)"
            />
          </div>
          {v.description ? (
            <div>
              <label htmlFor="task-desc" className="block text-xs font-medium text-slate-600">
                Beschreibung
              </label>
              <textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
              />
            </div>
          ) : null}
          {v.tags ? (
            <div>
              <span className="block text-xs font-medium text-slate-600">Tags</span>
              <div className="mt-1 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => removeTag(t)}
                    className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-800 hover:ring-red-200"
                    title="Tag entfernen"
                  >
                    {t} ×
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={onTagKeyDown}
                  placeholder="Tag, Enter oder Komma"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
                />
                <button
                  type="button"
                  onClick={addTagsFromDraft}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Hinzufügen
                </button>
              </div>
            </div>
          ) : null}
          {showEffortField ? (
            <div>
              <label htmlFor="task-effort" className="block text-xs font-medium text-slate-600">
                Aufwand (h)
              </label>
              <input
                id="task-effort"
                type="number"
                min={0}
                step={1}
                value={effort}
                onChange={(e) => setEffort(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
              />
            </div>
          ) : null}
          {v.dueDate || v.reminderDate ? (
            <div
              className={
                v.dueDate && v.reminderDate ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"
              }
            >
              {v.dueDate ? (
                <div>
                  <label htmlFor="task-due" className="block text-xs font-medium text-slate-600">
                    Fällig am
                  </label>
                  <input
                    id="task-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
                  />
                </div>
              ) : null}
              {v.reminderDate ? (
                <div>
                  <label htmlFor="task-rem" className="block text-xs font-medium text-slate-600">
                    Erinnerung
                  </label>
                  <input
                    id="task-rem"
                    type="date"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
