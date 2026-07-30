"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useEffect } from "react";

import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import { contextGapId } from "@/lib/context-list-dnd";
import type { TaskNode } from "@/types/task-node";

import { TaskRow, type TaskTitleSaveMeta } from "./task-row";

function GapDrop({
  insertIndex,
  large,
  emptyHint,
}: {
  insertIndex: number;
  large?: boolean;
  emptyHint?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: contextGapId(insertIndex),
    data: { kind: "contextGap" as const, insertIndex },
  });
  return (
    <div
      ref={setNodeRef}
      className={[
        "mx-1 rounded transition-all",
        large
          ? isOver
            ? "min-h-28 border border-dashed border-sky-400 bg-sky-50/90 px-4 py-8"
            : "min-h-28 border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8"
          : isOver
            ? "h-4 bg-sky-200/90 ring-1 ring-sky-400"
            : "h-2.5",
      ].join(" ")}
      aria-hidden={!emptyHint}
    >
      {emptyHint ? (
        <p className="pointer-events-none text-center text-sm text-slate-500">
          Keine Karten hier.{" "}
          <kbd className="rounded border px-1 text-[11px]">Enter</kbd> für Geschwister,{" "}
          <kbd className="rounded border px-1 text-[11px]">Tab</kbd> für Unterkarte.
          <span className="mt-2 block text-xs text-slate-400">
            Oder Karte aus der Zwischenablage hierher ziehen.
          </span>
        </p>
      ) : null}
    </div>
  );
}

export interface ContextCardListProps {
  nodes: TaskNode[];
  contextLabel: string;
  fieldVisibility: CardFieldVisibility;
  searchFocusNodeId?: string | null;
  keyboardFocusNodeId?: string | null;
  titleEditNodeId: string | null;
  nestDropTargetId?: string | null;
  onSelect: (nodeId: string) => void;
  onDrillIn: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onAddSibling: () => void;
  onOpenDetails: (nodeId: string) => void;
  onStartTitleEdit: (nodeId: string) => void;
  onTitleSave: (nodeId: string, title: string, meta?: TaskTitleSaveMeta) => void;
  onTitleEditCancel: (nodeId: string) => void;
  onRequestDelete?: (nodeId: string) => void;
}

export function ContextCardList({
  nodes,
  contextLabel,
  fieldVisibility,
  searchFocusNodeId,
  keyboardFocusNodeId,
  titleEditNodeId,
  nestDropTargetId,
  onSelect,
  onDrillIn,
  onAddChild,
  onAddSibling,
  onOpenDetails,
  onStartTitleEdit,
  onTitleSave,
  onTitleEditCancel,
  onRequestDelete,
}: ContextCardListProps) {
  useEffect(() => {
    if (!keyboardFocusNodeId) return;
    const el = document.querySelector(`[data-task-card-id="${CSS.escape(keyboardFocusNodeId)}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [keyboardFocusNodeId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{contextLabel}</h2>
        <button
          type="button"
          onClick={onAddSibling}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Karte
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-0 overflow-y-auto pb-8">
        <GapDrop insertIndex={0} large={nodes.length === 0} emptyHint={nodes.length === 0} />
        {nodes.map((node, index) => (
          <div key={node.id}>
            <TaskRow
              node={node}
              fieldVisibility={fieldVisibility}
              isSearchFocus={searchFocusNodeId === node.id}
              isKeyboardFocus={keyboardFocusNodeId === node.id}
              isNestDropTarget={nestDropTargetId === node.id}
              isTitleEditing={titleEditNodeId === node.id}
              onSelect={() => onSelect(node.id)}
              onDrillIn={() => onDrillIn(node.id)}
              onAddChild={() => onAddChild(node.id)}
              onOpenDetails={() => onOpenDetails(node.id)}
              onStartTitleEdit={() => onStartTitleEdit(node.id)}
              onTitleSave={(title, meta) => onTitleSave(node.id, title, meta)}
              onTitleEditCancel={() => onTitleEditCancel(node.id)}
              onRequestDelete={onRequestDelete ? () => onRequestDelete(node.id) : undefined}
            />
            <GapDrop insertIndex={index + 1} />
          </div>
        ))}
      </div>
    </div>
  );
}
