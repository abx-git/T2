"use client";

import { useDroppable } from "@dnd-kit/core";
import { ClipboardCopy } from "lucide-react";

import { CLIPBOARD_DROP_TARGET_ID } from "@/lib/clipboard-dnd";

export interface ClipboardDropTargetProps {
  count: number;
  open: boolean;
  onToggle: () => void;
}

export function ClipboardDropTarget({ count, open, onToggle }: ClipboardDropTargetProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: CLIPBOARD_DROP_TARGET_ID,
    data: { kind: "clipboardTarget" as const },
  });

  const dragging = Boolean(active);

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onToggle}
      className={[
        "flex min-h-8 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
        isOver && dragging
          ? "border-violet-400 bg-violet-50 text-violet-900 ring-2 ring-violet-200"
          : open
            ? "border-violet-300 bg-violet-50/80 text-violet-900"
            : "border-slate-200/90 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white hover:text-slate-900",
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
  );
}
