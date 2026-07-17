"use client";

import { useDroppable } from "@dnd-kit/core";
import { ClipboardCopy } from "lucide-react";
import { useEffect, useRef } from "react";

import { CLIPBOARD_DROP_TARGET_ID } from "@/lib/clipboard-dnd";

export interface ClipboardDropTargetProps {
  count: number;
  open: boolean;
  onToggle: () => void;
}

export function ClipboardDropTarget({ count, open, onToggle }: ClipboardDropTargetProps) {
  const skipClickRef = useRef(false);
  const { setNodeRef, isOver, active } = useDroppable({
    id: CLIPBOARD_DROP_TARGET_ID,
    data: { kind: "clipboardTarget" as const },
  });

  const dragging = Boolean(active);

  useEffect(() => {
    if (dragging) skipClickRef.current = true;
  }, [dragging]);

  const highlighted = isOver && dragging;

  return (
    <div
      ref={setNodeRef}
      data-clipboard-drop="header"
      className={[
        "flex min-h-10 min-w-[9rem] items-center rounded-lg border-2 border-dashed px-1 transition",
        highlighted
          ? "border-violet-500 bg-violet-100 ring-2 ring-violet-300"
          : dragging
            ? "border-violet-300 bg-violet-50/70"
            : open
              ? "border-violet-300 bg-violet-50/50"
              : "border-transparent",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => {
          if (skipClickRef.current) {
            skipClickRef.current = false;
            return;
          }
          onToggle();
        }}
        className={[
          "flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
          highlighted
            ? "text-violet-900"
            : open
              ? "text-violet-900"
              : "text-slate-700 hover:bg-white/80 hover:text-slate-900",
        ].join(" ")}
        title={
          dragging
            ? "Karte hier ablegen — wird mit Unterkarten in die Zwischenablage verschoben"
            : "Zwischenablage öffnen oder schließen"
        }
        aria-label={`Zwischenablage${count ? `, ${count} Karten` : ""}${open ? ", geöffnet" : ""}`}
        aria-pressed={open}
      >
        <ClipboardCopy className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Zwischenablage</span>
        {count > 0 ? (
          <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {count}
          </span>
        ) : null}
      </button>
    </div>
  );
}
