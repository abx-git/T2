"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MouseEvent, PointerEvent } from "react";

import { noteAccentClasses } from "@/lib/note-accent";
import { normalizeNoteMarkdown } from "@/lib/tree-node-kind";
import { useTaskTreeStore } from "@/store/task-tree-store";

function markdownComponents(accent: ReturnType<typeof noteAccentClasses>): Components {
  return {
    p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-snug">{children}</p>,
    h1: ({ children }) => (
      <h3 className="mb-1 mt-0.5 text-sm font-semibold leading-snug text-slate-900">{children}</h3>
    ),
    h2: ({ children }) => (
      <h4 className="mb-1 mt-0.5 text-[13px] font-semibold leading-snug text-slate-900">{children}</h4>
    ),
    h3: ({ children }) => (
      <h5 className="mb-1 mt-0.5 text-xs font-semibold leading-snug text-slate-800">{children}</h5>
    ),
    h4: ({ children }) => (
      <h6 className="mb-1 mt-0.5 text-xs font-medium leading-snug text-slate-800">{children}</h6>
    ),
    ul: ({ children }) => <ul className="mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
    ol: ({ children }) => (
      <ol className="mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-snug">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote
        className={["mb-1.5 border-l-2 pl-2 text-slate-600 last:mb-0", accent.markdownBlockquote].join(
          " ",
        )}
      >
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-700 underline decoration-sky-300/80 hover:text-sky-900"
      >
        {children}
      </a>
    ),
    code: ({ className, children }) => {
      const isBlock = Boolean(className);
      if (isBlock) {
        return (
          <code className="block overflow-x-auto rounded bg-slate-900/90 p-2 font-mono text-[10px] leading-relaxed text-slate-100">
            {children}
          </code>
        );
      }
      return (
        <code
          className={["rounded px-1 py-0.5 font-mono text-[10px]", accent.markdownCode].join(" ")}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => <pre className="mb-1.5 overflow-x-auto last:mb-0">{children}</pre>,
    hr: () => <hr className={["my-2", accent.markdownHr].join(" ")} />,
    strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
  };
}

export interface NoteMarkdownContentProps {
  markdown: string | undefined;
  /** Kompakte Darstellung auf Karten in der Liste. */
  compact?: boolean;
  className?: string;
}

/** Rendert Notiz-Markdown mehrzeilig (GFM: Listen, Überschriften, Code, …). */
export function NoteMarkdownContent({
  markdown,
  compact = false,
  className = "",
}: NoteMarkdownContentProps) {
  const noteAccentColor = useTaskTreeStore((s) => s.noteAccentColor);
  const accent = noteAccentClasses(noteAccentColor);
  const content = normalizeNoteMarkdown(markdown ?? "");
  if (!content.trim()) return null;

  const stopDragOnInteractive = (e: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) => {
    const el = e.target;
    if (el instanceof Element && el.closest("a, button")) {
      e.stopPropagation();
    }
  };

  return (
    <div
      className={[
        "note-markdown text-[11px] text-slate-700",
        compact ? "max-h-56 overflow-y-auto pr-1" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={stopDragOnInteractive}
      onClick={stopDragOnInteractive}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(accent)}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
