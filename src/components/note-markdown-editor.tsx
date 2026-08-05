"use client";

import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { MDXEditorMethods, MDXEditorProps } from "@mdxeditor/editor";

const Editor = dynamic(() => import("./note-mdx-editor-initialized"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[12rem] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
      Editor wird geladen…
    </div>
  ),
});

/** WYSIWYG-Markdown-Editor (MDXEditor) für Notizen — nur Client. */
export const NoteMarkdownEditor = forwardRef<MDXEditorMethods, MDXEditorProps>(
  function NoteMarkdownEditor(props, ref) {
    return <Editor {...props} editorRef={ref} />;
  },
);
