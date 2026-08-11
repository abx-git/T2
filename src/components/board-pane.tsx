"use client";

import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import type { CardInteractionMode } from "@/lib/card-expand";
import type { BoardPaneId } from "@/lib/board-pane";
import type { TaskNode } from "@/types/task-node";

import { BreadcrumbTrail } from "./breadcrumb-trail";
import { ContextCardList } from "./context-card-list";
import type { TaskTitleSaveMeta } from "./task-row";

export interface BoardPaneProps {
  paneId: BoardPaneId;
  active: boolean;
  dragging: boolean;
  contextNodeId: string | null;
  breadcrumbPath: TaskNode[];
  contextLabel: string;
  nodes: TaskNode[];
  fieldVisibility: CardFieldVisibility;
  searchFocusNodeId?: string | null;
  keyboardFocusNodeId?: string | null;
  titleEditNodeId: string | null;
  nestDropTargetId?: string | null;
  interactionMode: CardInteractionMode;
  cardCollapsedIds: ReadonlySet<string>;
  hideCompleted?: boolean;
  completedTag?: string;
  onActivate: () => void;
  onNavigateRoot: () => void;
  onNavigateTo: (id: string) => void;
  onDrillUp: () => void;
  onSelect: (nodeId: string) => void;
  onDrillIn: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onInteractionModeChange: (mode: CardInteractionMode) => void;
  onAddChild: (parentId: string) => void;
  onAddSibling: () => void;
  onAddNote: () => void;
  onOpenDetails: (nodeId: string) => void;
  onTitleSave: (nodeId: string, title: string, meta?: TaskTitleSaveMeta) => void;
  onTitleEditCancel: (nodeId: string) => void;
  onRequestExport?: (nodeId: string) => void;
  onRequestInsertTemplate?: (nodeId: string) => void;
  onRequestConvertToNote?: (nodeId: string) => void;
  onRequestDelete?: (nodeId: string) => void;
}

export function BoardPane({
  paneId,
  active,
  dragging,
  contextNodeId,
  breadcrumbPath,
  contextLabel,
  nodes,
  fieldVisibility,
  searchFocusNodeId,
  keyboardFocusNodeId,
  titleEditNodeId,
  nestDropTargetId,
  interactionMode,
  cardCollapsedIds,
  hideCompleted,
  completedTag,
  onActivate,
  onNavigateRoot,
  onNavigateTo,
  onDrillUp,
  onSelect,
  onDrillIn,
  onToggleExpand,
  onInteractionModeChange,
  onAddChild,
  onAddSibling,
  onAddNote,
  onOpenDetails,
  onTitleSave,
  onTitleEditCancel,
  onRequestExport,
  onRequestInsertTemplate,
  onRequestConvertToNote,
  onRequestDelete,
}: BoardPaneProps) {
  return (
    <div
      className={[
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-colors",
        active
          ? "bg-white ring-1 ring-inset ring-sky-300/80"
          : "bg-slate-50/60 opacity-[0.92]",
      ].join(" ")}
      data-board-pane-shell={paneId}
      data-active-pane={active ? "true" : "false"}
      onMouseDownCapture={onActivate}
    >
      <div
        className={[
          "shrink-0 border-b px-3 py-2",
          active ? "border-sky-100 bg-sky-50/40" : "border-slate-100",
        ].join(" ")}
      >
        <BreadcrumbTrail
          path={breadcrumbPath}
          onNavigateRoot={onNavigateRoot}
          onNavigateTo={onNavigateTo}
          onDrillUp={onDrillUp}
        />
      </div>
      <div
        className={[
          "flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3",
          dragging ? "touch-none" : "",
        ].join(" ")}
      >
        <ContextCardList
          paneId={paneId}
          nodes={nodes}
          contextNodeId={contextNodeId}
          contextLabel={contextLabel}
          fieldVisibility={fieldVisibility}
          searchFocusNodeId={searchFocusNodeId}
          keyboardFocusNodeId={keyboardFocusNodeId}
          titleEditNodeId={titleEditNodeId}
          nestDropTargetId={nestDropTargetId}
          interactionMode={interactionMode}
          cardCollapsedIds={cardCollapsedIds}
          hideCompleted={hideCompleted}
          completedTag={completedTag}
          onSelect={onSelect}
          onDrillIn={onDrillIn}
          onToggleExpand={onToggleExpand}
          onInteractionModeChange={onInteractionModeChange}
          onAddChild={onAddChild}
          onAddSibling={onAddSibling}
          onAddNote={onAddNote}
          onOpenDetails={onOpenDetails}
          onTitleSave={onTitleSave}
          onTitleEditCancel={onTitleEditCancel}
          onRequestExport={onRequestExport}
          onRequestInsertTemplate={onRequestInsertTemplate}
          onRequestConvertToNote={onRequestConvertToNote}
          onRequestDelete={onRequestDelete}
        />
      </div>
    </div>
  );
}
