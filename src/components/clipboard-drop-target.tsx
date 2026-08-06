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

/** Kompakter Zwischenablage-Button (bleibt Drop-Ziel für DnD). */
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
        "relative rounded-lg transition",
        highlighted
          ? "ring-2 ring-violet-400 ring-offset-1"
          : dragging
            ? "ring-1 ring-violet-300 ring-offset-1"
            : "",
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
          "relative flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition",
          highlighted
            ? "bg-violet-100 text-violet-900"
            : open
              ? "bg-violet-50 text-violet-900"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        ].join(" ")}
        title={
          dragging
            ? "Karte hier ablegen — wird mit Unterkarten in die Zwischenablage verschoben"
            : "Zwischenablage"
        }
        aria-label={`Zwischenablage${count ? `, ${count} Karten` : ""}${open ? ", geöffnet" : ""}`}
        aria-pressed={open}
      >
        <ClipboardCopy className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Ablage</span>
        {count > 0 ? (
          <span className="min-w-[1.15rem] rounded-full bg-violet-600 px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
            {count}
          </span>
        ) : null}
      </button>
    </div>
  );
}
