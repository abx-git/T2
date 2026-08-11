"use client";

import { Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { MDXEditorMethods } from "@mdxeditor/editor";

import { formatTaskIdForDisplay, isLoxTaskId } from "@/lib/task-id";
import { noteAccentClasses } from "@/lib/note-accent";
import { isNoteNode, normalizeNoteMarkdown } from "@/lib/tree-node-kind";
import { findNodeById } from "@/lib/tree-utils";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { NoteEditableFields } from "@/types/task-node";

import { NoteMarkdownEditor } from "./note-markdown-editor";

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
  const [markdownSeed, setMarkdownSeed] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const editorRef = useRef<MDXEditorMethods>(null);

  useEffect(() => {
    if (!open || !nodeId) return;
    const n = findNodeById(useTaskTreeStore.getState().roots, nodeId);
    if (!n || !isNoteNode(n)) return;
    const md = n.markdown ?? "";
    setTitle(n.title);
    setMarkdown(md);
    setMarkdownSeed(md);
    setEditorKey((k) => k + 1);
  }, [open, nodeId]);

  useEffect(() => {
    if (!open || !nodeId) return;
    const t = window.setTimeout(() => {
      editorRef.current?.focus(undefined, { preventScroll: true, defaultSelection: "rootEnd" });
    }, 80);
    return () => clearTimeout(t);
  }, [open, nodeId, editorKey]);

  if (!open || !nodeId) return null;

  if (!node || !isNoteNode(node)) {
    return (
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
          <p className="text-sm text-slate-600">Notiz nicht gefunden.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
          >
            Schließen
          </button>
        </div>
      </div>
    );
  }

  const currentMarkdown = () =>
    normalizeNoteMarkdown(editorRef.current?.getMarkdown() ?? markdown);

  const saveFields = (meta?: NoteEditorSaveMeta) => {
    onSave(
      node.id,
      {
        title: title.trim(),
        markdown: currentMarkdown(),
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
      className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/15 sm:max-h-[min(88vh,44rem)] sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-4 pb-3 pt-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                Notiz
              </h2>
              <span className="truncate font-mono text-[10px] text-slate-400">
                {formatTaskIdForDisplay(node.id)}
                {isLoxTaskId(node.id) ? "" : " · Legacy"}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">
              WYSIWYG · Quelltext in der Toolbar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-4 py-3">
          <input
            id="note-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={[
              "w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:ring-2",
              accent.editorRing,
            ].join(" ")}
            placeholder="Titel (optional)"
          />
          <div
            id={markdownId}
            className={[
              "note-mdx-editor min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 focus-within:ring-2",
              accent.editorRing,
            ].join(" ")}
          >
            <NoteMarkdownEditor
              key={editorKey}
              ref={editorRef}
              markdown={markdownSeed}
              onChange={(value) => setMarkdown(value)}
              contentEditableClassName="note-mdx-content min-h-[10rem] px-3 py-2 text-sm leading-relaxed text-slate-900 outline-none"
              placeholder="Notiz schreiben…"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
          {onRequestDelete ? (
            <button
              type="button"
              onClick={onRequestDelete}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50"
              title="Löschen"
              aria-label="Löschen"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className={["h-9 rounded-lg px-4 text-sm font-medium text-white", accent.editorPrimary].join(
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
