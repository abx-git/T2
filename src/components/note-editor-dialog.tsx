"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { formatTaskIdForDisplay, isLoxTaskId } from "@/lib/task-id";
import { noteAccentClasses } from "@/lib/note-accent";
import { isNoteNode, nodeDisplayTitle, normalizeNoteMarkdown } from "@/lib/tree-node-kind";
import { findNodeById } from "@/lib/tree-utils";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { NoteEditableFields } from "@/types/task-node";

export type NoteEditorSaveMeta = { addSiblingAfter?: boolean };

export interface NoteEditorDialogProps {
  open: boolean;
  nodeId: string | null;
  onClose: () => void;
  onSave: (nodeId: string, fields: NoteEditableFields, meta?: NoteEditorSaveMeta) => void;
  onRequestDelete?: () => void;
}

export function NoteEditorDialog({
  open,
  nodeId,
  onClose,
  onSave,
  onRequestDelete,
}: NoteEditorDialogProps) {
  const titleId = useId();
  const markdownId = useId();
  const roots = useTaskTreeStore((s) => s.roots);
  const noteAccentColor = useTaskTreeStore((s) => s.noteAccentColor);
  const accent = noteAccentClasses(noteAccentColor);
  const node = nodeId ? findNodeById(roots, nodeId) : null;

  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const markdownRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || !node || !isNoteNode(node)) return;
    setTitle(node.title);
    setMarkdown(node.markdown ?? "");
  }, [open, node]);

  useEffect(() => {
    if (!open || !node) return;
    const t = window.setTimeout(() => markdownRef.current?.focus({ preventScroll: true }), 0);
    return () => clearTimeout(t);
  }, [open, node]);

  if (!open || !nodeId) return null;

  if (!node || !isNoteNode(node)) {
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
          <p className="text-sm text-slate-600">Notiz nicht gefunden.</p>
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

  const saveFields = (meta?: NoteEditorSaveMeta) => {
    onSave(
      node.id,
      {
        title: title.trim(),
        markdown: normalizeNoteMarkdown(markdown),
      },
      meta,
    );
    if (!meta?.addSiblingAfter) onClose();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveFields();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            Notiz bearbeiten
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Markdown-Inhalt — Einordnung und Verschieben wie bei Karten.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <span className="font-mono">
              {formatTaskIdForDisplay(node.id)}
              {isLoxTaskId(node.id) ? "" : " (Legacy)"}
            </span>
            <span className="mx-2 text-slate-300">·</span>
            <span>{nodeDisplayTitle(node)}</span>
          </div>
          <div>
            <label htmlFor="note-title" className="block text-xs font-medium text-slate-600">
              Titel (optional)
            </label>
            <input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={[
                "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2",
                accent.editorRing,
              ].join(" ")}
              placeholder="Kurzbezeichnung für Struktur und Suche"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <label htmlFor={markdownId} className="block text-xs font-medium text-slate-600">
              Markdown
            </label>
            <textarea
              ref={markdownRef}
              id={markdownId}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={14}
              spellCheck={true}
              className={[
                "mt-1 min-h-[12rem] w-full flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm leading-relaxed text-slate-900 outline-none focus:ring-2",
                accent.editorRing,
              ].join(" ")}
              placeholder="# Überschrift&#10;&#10;Notiztext …"
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {onRequestDelete ? (
              <button
                type="button"
                onClick={onRequestDelete}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Löschen
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className={["rounded-lg px-4 py-2 text-sm font-medium text-white", accent.editorPrimary].join(
                " ",
              )}
            >
              Speichern
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
