"use client";

import { useId, useLayoutEffect, useMemo, useState } from "react";

import {
  collectAllTagsFromForest,
  countTagUsagesInForest,
  normalizeTagLabel,
  tagKey,
} from "@/lib/task-tags";
import { useTaskTreeStore } from "@/store/task-tree-store";

export interface TagRenameDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TagRenameDialog({ open, onClose }: TagRenameDialogProps) {
  const titleId = useId();
  const roots = useTaskTreeStore((s) => s.roots);
  const renameTagGlobally = useTaskTreeStore((s) => s.renameTagGlobally);

  const allTags = useMemo(() => collectAllTagsFromForest(roots), [roots]);
  const [selectedTag, setSelectedTag] = useState("");
  const [newName, setNewName] = useState("");

  useLayoutEffect(() => {
    if (!open) return;
    setSelectedTag(allTags[0] ?? "");
    setNewName("");
  }, [open, allTags]);

  useLayoutEffect(() => {
    if (!open || !selectedTag) return;
    setNewName(selectedTag);
  }, [open, selectedTag]);

  if (!open) return null;

  const usageCount = selectedTag ? countTagUsagesInForest(roots, selectedTag) : 0;
  const trimmedNew = normalizeTagLabel(newName);
  const isUnchanged = selectedTag && trimmedNew && tagKey(trimmedNew) === tagKey(selectedTag);
  const canApply = Boolean(selectedTag && trimmedNew && !isUnchanged);

  const handleApply = () => {
    if (!canApply) return;
    renameTagGlobally(selectedTag, trimmedNew);
    onClose();
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
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-sm font-semibold text-slate-900">
          Tags umbenennen
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Ein Tag wird auf allen Karten, in Filtern und als Erledigt-Tag angepasst.
        </p>

        {allTags.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">Noch keine Tags vorhanden.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor={`${titleId}-select`} className="mb-0.5 block text-[11px] font-medium text-slate-500">
                Tag auswählen
              </label>
              <select
                id={`${titleId}-select`}
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none ring-sky-400/80 focus:border-sky-300 focus:ring-2"
              >
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${titleId}-new`} className="mb-0.5 block text-[11px] font-medium text-slate-500">
                Neuer Name
              </label>
              <input
                id={`${titleId}-new`}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none ring-sky-400/80 focus:border-sky-300 focus:ring-2"
                autoComplete="off"
                maxLength={80}
              />
            </div>
            {selectedTag ? (
              <p className="text-[11px] text-slate-500">
                {usageCount === 1
                  ? "1 Karte verwendet dieses Tag."
                  : `${usageCount} Karten verwenden dieses Tag.`}
              </p>
            ) : null}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Abbrechen
          </button>
          {allTags.length > 0 ? (
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Umbenennen
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
