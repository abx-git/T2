"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { mergeCardFieldVisibility } from "@/lib/card-field-visibility";
import { fromInputDateTimeLocal, toInputDateTimeLocal } from "@/lib/task-datetime";
import {
  calculateEffortFieldsFromChildren,
  DEFAULT_EFFORT_UNIT,
  EFFORT_UNIT_LABELS,
  EFFORT_UNITS,
  formatEffortTotals,
  getEffectiveEffortTotals,
  getEffortSource,
  getEffortUnit,
  type EffortSource,
  type EffortUnit,
} from "@/lib/task-effort";
import { formatTaskIdForDisplay, isLoxTaskId } from "@/lib/task-id";
import { normalizeTaskLink } from "@/lib/task-link";
import { findNodeById } from "@/lib/tree-utils";
import {
  collectAllTagsFromForest,
  isTaskMarkedDone,
  MILESTONE_TAG_DISPLAY,
  setCompletedTagOnTags,
  tagChipClass,
  tagsAvailableForFilter,
  tagsWithoutCompletedTag,
  uniqNonEmptyTags,
} from "@/lib/task-tags";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskCardEditableFields, TaskNode } from "@/types/task-node";

function splitTagInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export type TaskEditorSaveMeta = { addSiblingAfter?: boolean };

export interface TaskEditorDialogProps {
  open: boolean;
  nodeId: string | null;
  onClose: () => void;
  onSave: (nodeId: string, fields: TaskCardEditableFields, meta?: TaskEditorSaveMeta) => void;
  onRequestDelete?: () => void;
}

export function TaskEditorDialog({ open, nodeId, onClose, onSave, onRequestDelete }: TaskEditorDialogProps) {
  const roots = useTaskTreeStore((s) => s.roots);
  const cardFieldVisibility = useTaskTreeStore((s) => s.cardFieldVisibility);
  const effortOnTasksEnabled = useTaskTreeStore((s) => s.effortOnTasksEnabled);
  const completedTag = useTaskTreeStore((s) => s.completedTag);
  const v = mergeCardFieldVisibility(cardFieldVisibility);
  const node = nodeId ? findNodeById(roots, nodeId) : null;

  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [effort, setEffort] = useState(0);
  const [effortUnit, setEffortUnit] = useState<EffortUnit>(DEFAULT_EFFORT_UNIT);
  const [effortSource, setEffortSource] = useState<EffortSource>("manual");
  const [dueDate, setDueDate] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !node) return;
    setTitle(node.title);
    setLink(node.link);
    setDescription(node.description);
    setTags([...node.tags]);
    setTagDraft("");
    setEffort(node.effort);
    setEffortUnit(getEffortUnit(node));
    setEffortSource(getEffortSource(node));
    setDueDate(toInputDateTimeLocal(node.dueDate));
    setReminderDate(toInputDateTimeLocal(node.reminderDate));
  }, [open, node]);

  useEffect(() => {
    if (!open || !node || node.title.trim()) return;
    const t = window.setTimeout(() => titleInputRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(t);
  }, [open, node]);

  const allTags = useMemo(() => collectAllTagsFromForest(roots), [roots]);
  const pickableTags = useMemo(
    () => tagsAvailableForFilter(allTags, tags),
    [allTags, tags],
  );

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
    const next = tagsWithoutCompletedTag(splitTagInput(tagDraft), completedTag);
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

  const isDone = isTaskMarkedDone({ tags }, completedTag);
  const displayTags = tagsWithoutCompletedTag(tags, completedTag);

  const addTag = (t: string) => {
    setTags(uniqNonEmptyTags([...tags, t]));
  };

  const setDone = (done: boolean) => {
    setTags(setCompletedTagOnTags(tags, completedTag, done));
  };

  const hasChildren = node.children.length > 0;
  const isCalculated = effortSource === "calculated";
  const previewCalculated = hasChildren
    ? calculateEffortFieldsFromChildren(node, completedTag)
    : { effort: 0, effortUnit: DEFAULT_EFFORT_UNIT };

  const applyCalculatedFromChildren = () => {
    if (!hasChildren) return;
    const next = calculateEffortFieldsFromChildren(node, completedTag);
    setEffortSource("calculated");
    setEffort(next.effort);
    setEffortUnit(next.effortUnit);
  };

  const switchToManual = () => {
    setEffortSource("manual");
  };

  const saveFields = (meta?: TaskEditorSaveMeta) => {
    let nextEffort = effortOnTasksEnabled && Number.isFinite(effort) && effort >= 0 ? effort : 0;
    let nextUnit = effortOnTasksEnabled ? effortUnit : DEFAULT_EFFORT_UNIT;
    let nextSource: EffortSource = effortOnTasksEnabled ? effortSource : "manual";
    if (nextSource === "calculated" && hasChildren) {
      const c = calculateEffortFieldsFromChildren(node, completedTag);
      nextEffort = c.effort;
      nextUnit = c.effortUnit;
    }
    onSave(
      node.id,
      {
        title: title.trim(),
        link: normalizeTaskLink(link),
        description: description.trim(),
        tags: uniqNonEmptyTags(tags),
        effort: nextEffort,
        effortUnit: nextUnit,
        effortSource: nextSource,
        dueDate: fromInputDateTimeLocal(dueDate),
        reminderDate: fromInputDateTimeLocal(reminderDate),
      },
      meta,
    );
    if (!meta?.addSiblingAfter) onClose();
  };

  const handleFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter" || !e.shiftKey) return;
    if (e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    saveFields({ addSiblingAfter: true });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveFields();
  };

  const showEffortField = effortOnTasksEnabled && v.effort;
  const calculatedPreviewLabel = hasChildren
    ? formatEffortTotals(getEffectiveEffortTotals(node, completedTag))
    : "";

  const dialog = (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-xl border border-slate-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl touch-manipulation sm:max-h-[90vh] sm:rounded-xl sm:pb-5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 id="task-editor-title" className="text-lg font-semibold text-slate-900">
          Details
        </h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Titel darf leer sein. Tag „{MILESTONE_TAG_DISPLAY}“ markiert einen Meilenstein; Elternkarten zeigen den
          Aufwand davor. <span className="text-slate-400">⇧↵ speichert und legt die nächste Geschwisterkarte an.</span>
        </p>
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="mt-4 space-y-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Karten-ID{isLoxTaskId(node.id) ? "" : " (Legacy)"}
            </span>
            <div className="mt-1 flex items-center gap-2">
              <code className="font-mono text-sm font-semibold text-slate-800">{formatTaskIdForDisplay(node.id)}</code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(node.id)}
                className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-white"
              >
                Kopieren
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="task-title" className="block text-xs font-medium text-slate-600">
              Titel
            </label>
            <input
              ref={titleInputRef}
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
              placeholder="(optional)"
            />
          </div>
          <div>
            <label htmlFor="task-link" className="block text-xs font-medium text-slate-600">
              Link
            </label>
            <input
              id="task-link"
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
              placeholder="https://… (optional, Titel wird klickbar)"
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
                {displayTags.map((t) => (
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
              {pickableTags.length > 0 ? (
                <div className="mt-2">
                  <span className="block text-[10px] font-medium text-slate-500">Vorhandene Tags</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pickableTags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addTag(t)}
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition hover:ring-sky-300/80",
                          tagChipClass(t, completedTag),
                        ].join(" ")}
                        title={`Tag „${t}“ hinzufügen`}
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {showEffortField ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="task-effort" className="block text-xs font-medium text-slate-600">
                  Aufwand
                </label>
                <span className="text-[10px] text-slate-500">
                  {isCalculated ? "berechnet aus Kindern" : "manuell gesetzt"}
                </span>
              </div>
              <div
                className="mt-1 flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  onClick={switchToManual}
                  className={[
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition",
                    !isCalculated
                      ? "border-sky-300 bg-sky-50 text-sky-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  Manuell
                </button>
                <button
                  type="button"
                  onClick={applyCalculatedFromChildren}
                  disabled={!hasChildren}
                  title={
                    hasChildren
                      ? "Summe der offenen Unterkarten (ohne erledigte)"
                      : "Nur mit Unterkarten möglich"
                  }
                  className={[
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                    isCalculated
                      ? "border-violet-300 bg-violet-50 text-violet-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                >
                  Aus Kindern berechnen
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  id="task-effort"
                  type="number"
                  min={0}
                  step={effortUnit === "minutes" ? 5 : effortUnit === "workdays" ? 0.5 : 0.25}
                  value={isCalculated ? previewCalculated.effort : effort}
                  readOnly={isCalculated}
                  onChange={(e) => {
                    switchToManual();
                    setEffort(Number(e.target.value));
                  }}
                  className={[
                    "min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2",
                    isCalculated ? "border-violet-200 bg-violet-50/50" : "border-slate-200",
                  ].join(" ")}
                />
                <select
                  id="task-effort-unit"
                  value={isCalculated ? previewCalculated.effortUnit : effortUnit}
                  disabled={isCalculated}
                  onChange={(e) => {
                    switchToManual();
                    setEffortUnit(e.target.value as EffortUnit);
                  }}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2 disabled:bg-slate-50"
                  aria-label="Einheit des Aufwands"
                >
                  {EFFORT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {EFFORT_UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              </div>
              {isCalculated && calculatedPreviewLabel ? (
                <p className="mt-1 text-[10px] text-violet-800">
                  Aktuell Σ Kinder (offen): {calculatedPreviewLabel}
                </p>
              ) : null}
              <p className="mt-1 text-[10px] text-slate-500">
                Werktage: kritischer Pfad zählt ohne Samstag/Sonntag. Erledigte Kinder zählen nicht.
              </p>
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
                    Fällig am (Datum und optional Uhrzeit)
                  </label>
                  <input
                    id="task-due"
                    type="datetime-local"
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
                    type="datetime-local"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500/30 focus:ring-2"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-500">
            <input
              type="checkbox"
              checked={isDone}
              onChange={(e) => setDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
            />
            <span>
              Erledigt <span className="text-slate-400">(Tag „{completedTag}“)</span>
            </span>
          </label>
          <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-slate-100 bg-white px-5 py-4">
            {onRequestDelete ? (
              <button
                type="button"
                onClick={() => onRequestDelete()}
                className="mr-auto min-h-11 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 active:bg-red-50"
              >
                Löschen
              </button>
            ) : (
              <span className="mr-auto" />
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => saveFields()}
              className="min-h-11 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 active:bg-sky-800"
            >
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(dialog, document.body) : dialog;
}
