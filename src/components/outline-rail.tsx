"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, GripVertical, PanelLeftClose, PanelLeft, StickyNote } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { buildBoardOutlineRows } from "@/lib/board-outline";
import { isCoarsePointerDevice } from "@/lib/coarse-pointer";
import {
  outlineDragId,
  outlineGapId,
  outlineNestId,
} from "@/lib/outline-dnd";
import { isNoteNode, nodeDisplayTitle } from "@/lib/tree-node-kind";
import { noteAccentClasses } from "@/lib/note-accent";
import { isTaskMarkedDone } from "@/lib/task-tags";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskNode } from "@/types/task-node";

import type { TaskTitleSaveMeta } from "./task-row";

export type OutlineRailVariant = "rail" | "light";

export interface OutlineRailProps {
  roots: TaskNode[];
  collapsedIds: ReadonlySet<string>;
  contextNodeId: string | null;
  hideCompletedTasks: boolean;
  completedTag: string;
  nestDropTargetId?: string | null;
  onSelectNode: (nodeId: string) => void;
  onToggleCollapsed: (nodeId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: OutlineRailVariant;
  keyboardFocusNodeId?: string | null;
  titleEditNodeId?: string | null;
  onTitleSave?: (nodeId: string, title: string, meta?: TaskTitleSaveMeta) => void;
  onTitleEditCancel?: (nodeId: string) => void;
  onOpenDetails?: (nodeId: string) => void;
}

function OutlineGap({
  listParentId,
  beforeId,
}: {
  listParentId: string | null;
  beforeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: outlineGapId(listParentId, beforeId),
    data: { kind: "outlineGap" as const, listParentId, beforeId },
  });
  return (
    <div
      ref={setNodeRef}
      className={[
        "mx-1 rounded transition-all",
        isOver ? "h-2.5 bg-sky-200/90 ring-1 ring-sky-400" : "h-1",
      ].join(" ")}
      aria-hidden
    />
  );
}

function OutlineRow({
  node,
  depth,
  selected,
  keyboardFocus,
  done,
  collapsed,
  hasChildren,
  isNestTarget,
  light,
  isTitleEditing,
  onSelect,
  onToggleCollapsed,
  onOpenDetails,
  onTitleSave,
  onTitleEditCancel,
}: {
  node: TaskNode;
  depth: number;
  selected: boolean;
  keyboardFocus: boolean;
  done: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  isNestTarget: boolean;
  light: boolean;
  isTitleEditing: boolean;
  onSelect: () => void;
  onToggleCollapsed: () => void;
  onOpenDetails?: () => void;
  onTitleSave?: (title: string, meta?: TaskTitleSaveMeta) => void;
  onTitleEditCancel?: () => void;
}) {
  const noteAccentColor = useTaskTreeStore((s) => s.noteAccentColor);
  const accent = noteAccentClasses(noteAccentColor);
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: outlineDragId(node.id),
    data: { kind: "outlineCard" as const, source: "outline" as const, nodeId: node.id },
    disabled: isTitleEditing,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: outlineNestId(node.id),
    data: { kind: "outlineNest" as const, nodeId: node.id },
    disabled: isDragging || isTitleEditing,
  });

  const [titleDraft, setTitleDraft] = useState(node.title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleEditStartedAtRef = useRef(0);
  const coarsePointer = isCoarsePointerDevice();

  useEffect(() => {
    if (!isTitleEditing) return;
    setTitleDraft(node.title);
    titleEditStartedAtRef.current = Date.now();
    titleInputRef.current?.focus({ preventScroll: true });
    titleInputRef.current?.select();
  }, [isTitleEditing, node.id, node.title]);

  const commitTitle = (meta?: TaskTitleSaveMeta) => {
    onTitleSave?.(titleDraft, meta);
  };

  const onTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle(e.shiftKey ? { addSiblingAfter: true } : undefined);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onTitleEditCancel?.();
    }
  };

  return (
    <div
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
      }}
      data-outline-node-id={node.id}
      className={[
        "group flex touch-none cursor-grab items-center gap-0.5 rounded-md text-left active:cursor-grabbing",
        light ? "px-1 py-1 text-sm" : "px-0.5 py-0.5 text-xs",
        selected ? "bg-sky-100/90 text-sky-950" : "text-slate-700 hover:bg-white",
        keyboardFocus && !selected ? "ring-2 ring-sky-300/90" : "",
        keyboardFocus && selected ? "ring-2 ring-sky-400/80" : "",
        isDragging ? "opacity-40" : "",
        isNestTarget || isOver
          ? isNoteNode(node)
            ? accent.outlineNest
            : "bg-violet-50 ring-1 ring-violet-300"
          : "",
      ].join(" ")}
      style={{ paddingLeft: `${(light ? 8 : 4) + depth * (light ? 16 : 12)}px` }}
      {...(isTitleEditing ? {} : attributes)}
      {...(isTitleEditing ? {} : listeners)}
    >
      <span
        className={[
          "flex shrink-0 items-center justify-center text-slate-300",
          light ? "h-6 w-4" : "h-5 w-3.5",
        ].join(" ")}
        aria-hidden
      >
        <GripVertical className={light ? "h-3.5 w-3.5" : "h-3 w-3"} />
      </span>
      {hasChildren ? (
        <button
          type="button"
          className={[
            "flex shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-700",
            light ? "h-6 w-6" : "h-5 w-5",
          ].join(" ")}
          aria-label={collapsed ? "Aufklappen" : "Zuklappen"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
        >
          {collapsed ? (
            <ChevronRight className={light ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
          ) : (
            <ChevronDown className={light ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden />
          )}
        </button>
      ) : (
        <span className={light ? "w-6 shrink-0" : "w-5 shrink-0"} aria-hidden />
      )}
      {isTitleEditing ? (
        <input
          ref={titleInputRef}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={onTitleKeyDown}
          onBlur={() => {
            if (coarsePointer) return;
            if (Date.now() - titleEditStartedAtRef.current < 120) {
              window.setTimeout(() => {
                titleInputRef.current?.focus({ preventScroll: true });
              }, 0);
              return;
            }
            commitTitle();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          autoFocus
          className="min-w-0 flex-1 rounded border border-sky-300 bg-white px-1.5 py-0.5 text-sm text-slate-900 outline-none ring-2 ring-sky-200"
          aria-label="Titel"
        />
      ) : (
        <button
          type="button"
          className={[
            "min-w-0 flex-1 truncate text-left",
            light ? "py-0.5" : "py-0.5",
            done ? "text-slate-400 line-through" : "",
          ].join(" ")}
          title={nodeDisplayTitle(node)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenDetails?.();
          }}
          onContextMenu={(e) => {
            if (!onOpenDetails) return;
            e.preventDefault();
            e.stopPropagation();
            onSelect();
            onOpenDetails();
          }}
        >
          {isNoteNode(node) ? (
            <StickyNote
              className={[
                "mr-1 inline shrink-0",
                light ? "h-3.5 w-3.5" : "h-3 w-3",
                accent.outlineIcon,
              ].join(" ")}
              aria-hidden
            />
          ) : null}
          {nodeDisplayTitle(node)}
        </button>
      )}
    </div>
  );
}

function OutlineTreeList({
  rows,
  collapsedIds,
  completedTag,
  nestDropTargetId,
  selectedNodeId,
  keyboardFocusNodeId,
  titleEditNodeId,
  light,
  onSelectNode,
  onToggleCollapsed,
  onTitleSave,
  onTitleEditCancel,
  onOpenDetails,
}: {
  rows: ReturnType<typeof buildBoardOutlineRows>;
  collapsedIds: ReadonlySet<string>;
  completedTag: string;
  nestDropTargetId: string | null;
  selectedNodeId: string | null;
  keyboardFocusNodeId?: string | null;
  titleEditNodeId?: string | null;
  light: boolean;
  onSelectNode: (nodeId: string) => void;
  onToggleCollapsed: (nodeId: string) => void;
  onTitleSave?: (nodeId: string, title: string, meta?: TaskTitleSaveMeta) => void;
  onTitleEditCancel?: (nodeId: string) => void;
  onOpenDetails?: (nodeId: string) => void;
}) {
  return (
    <ul className="space-y-0">
      {rows.map((row) => {
        const listParentId = row.listParentId || null;
        const selected = selectedNodeId === row.node.id;
        const done = isTaskMarkedDone(row.node, completedTag);
        const hasChildren = row.node.children.length > 0;
        const collapsed = collapsedIds.has(row.node.id);
        const nextSibling = rows.find(
          (r) =>
            r.listParentId === row.listParentId &&
            r.siblingIndex === row.siblingIndex + 1,
        );
        return (
          <li key={row.node.id}>
            {row.siblingIndex === 0 ? (
              <OutlineGap listParentId={listParentId} beforeId={row.node.id} />
            ) : null}
            <OutlineRow
              node={row.node}
              depth={row.depth}
              selected={selected}
              keyboardFocus={keyboardFocusNodeId === row.node.id}
              done={done}
              collapsed={collapsed}
              hasChildren={hasChildren}
              isNestTarget={nestDropTargetId === row.node.id}
              light={light}
              isTitleEditing={titleEditNodeId === row.node.id}
              onSelect={() => onSelectNode(row.node.id)}
              onToggleCollapsed={() => onToggleCollapsed(row.node.id)}
              onOpenDetails={onOpenDetails ? () => onOpenDetails(row.node.id) : undefined}
              onTitleSave={
                onTitleSave
                  ? (title, meta) => onTitleSave(row.node.id, title, meta)
                  : undefined
              }
              onTitleEditCancel={
                onTitleEditCancel ? () => onTitleEditCancel(row.node.id) : undefined
              }
            />
            {row.isLastSibling ? (
              <OutlineGap listParentId={listParentId} beforeId={null} />
            ) : (
              <OutlineGap
                listParentId={listParentId}
                beforeId={nextSibling?.node.id ?? null}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function OutlineRail({
  roots,
  collapsedIds,
  contextNodeId,
  hideCompletedTasks,
  completedTag,
  nestDropTargetId = null,
  onSelectNode,
  onToggleCollapsed,
  open: openProp,
  onOpenChange,
  variant = "rail",
  keyboardFocusNodeId = null,
  titleEditNodeId = null,
  onTitleSave,
  onTitleEditCancel,
  onOpenDetails,
}: OutlineRailProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternalOpen(v);
  };
  const light = variant === "light";

  // Struktur: volle Hierarchie ohne Erledigt-Filter, damit Umsortieren vorhersehbar bleibt.
  const rows = useMemo(
    () => buildBoardOutlineRows(roots, false, completedTag, collapsedIds),
    [roots, completedTag, collapsedIds],
  );

  const selectedNodeId = light ? (keyboardFocusNodeId ?? contextNodeId) : contextNodeId;

  const treeList = (
    <OutlineTreeList
      rows={rows}
      collapsedIds={collapsedIds}
      completedTag={completedTag}
      nestDropTargetId={nestDropTargetId}
      selectedNodeId={selectedNodeId}
      keyboardFocusNodeId={keyboardFocusNodeId}
      titleEditNodeId={titleEditNodeId}
      light={light}
      onSelectNode={onSelectNode}
      onToggleCollapsed={onToggleCollapsed}
      onTitleSave={onTitleSave}
      onTitleEditCancel={onTitleEditCancel}
      onOpenDetails={onOpenDetails}
    />
  );

  if (light) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-3 sm:px-6">
          <div className="min-h-0 flex-1 overflow-y-auto py-3">
            {rows.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-slate-500">
                Noch keine Karten.{" "}
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px]">
                  Enter
                </kbd>{" "}
                legt die erste Karte an.
              </p>
            ) : (
              treeList
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-slate-200/80 bg-slate-50/90 px-3 py-2 sm:px-6">
          <p className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px]">↑↓</kbd>{" "}
              navigieren
            </span>
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px]">←→</kbd>{" "}
              auf/zu
            </span>
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px]">Enter</kbd>{" "}
              Karte
            </span>
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px]">Tab</kbd>{" "}
              Kind
            </span>
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px]">⇧Enter</kbd>{" "}
              Notiz
            </span>
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px]">F2</kbd>{" "}
              Details
            </span>
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px]">Entf</kbd>{" "}
              löschen
            </span>
            <span>
              <kbd className="rounded border border-slate-200 bg-white px-1 font-mono text-[10px]">?</kbd>{" "}
              Hilfe
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50/80 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"
          title="Struktur zeigen"
          aria-label="Struktur zeigen"
        >
          <PanelLeft className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 md:w-72">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-2">
        <div className="min-w-0 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Struktur
          </p>
          <p className="truncate text-[10px] text-slate-400">
            Ziehen zum Umsortieren / Nesten
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700"
          title="Struktur einklappen"
          aria-label="Struktur einklappen"
        >
          <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {rows.length === 0 ? (
          <p className="px-2 py-4 text-xs text-slate-500">Noch keine Karten.</p>
        ) : (
          treeList
        )}
        {hideCompletedTasks ? (
          <p className="px-2 pb-2 pt-1 text-[10px] text-slate-400">
            Erledigte sind in der Liste ausgeblendet, in der Struktur weiterhin sichtbar.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
