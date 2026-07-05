"use client";

import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  Over,
} from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { HardDrive, Settings2, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { applyBoardJsonToStore, boardJsonFromStoreState } from "@/lib/file-board-reconcile";
import type { BoardSnapshotV1 } from "@/lib/task-tree-json";
import {
  boardSnapshotToReplacePayload,
  buildBoardSnapshot,
  downloadJsonFile,
  downloadTextFile,
  flattenNodesForParentSelect,
  isBoardSnapshot,
  isSubtreeSnapshot,
  parseExportedDocument,
  stringifyExportedDocument,
  taskNodeFromJson,
} from "@/lib/task-tree-json";
import { parseFreemindMmToRoots, taskRootsToFreemindMm } from "@/lib/freemind-mm";
import {
  attachWorkingFileFromPicker,
  createAndAttachWorkingFile,
  detachWorkingFile,
  fileSystemAccessUnavailableMessage,
  fileSystemAccessUnavailableTooltip,
  getWorkingFileHandle,
  isWorkingFileAttached,
  isWorkingFileDirty,
  isWorkingFileSupported,
  markWorkingFileSessionHydrated,
  markWorkingFileSynced,
  STANDARD_WORKING_FILENAME,
  writeWorkingFileJson,
} from "@/lib/working-file";
import {
  buildMindmapDropPreview,
  COLUMN_GAP_PREFIX,
  dragOverKindFromPreview,
  findNodeById,
  getMindmapBoardLayout,
  pathFromRootToNode,
  parseColumnGapId,
  rootsForMindmapDisplay,
  type TreeDragOverKind,
} from "@/lib/tree-utils";
import { getBoardMaxVisibleLevels } from "@/lib/tree-depth-collapse";
import {
  dataStorageButtonClassName,
  deriveStorageDisplayStatus,
  formatStorageStatusTooltip,
  hasUnsavedWorkingFile,
} from "@/lib/storage-coordinator";
import { useTaskTreeStore } from "@/store/task-tree-store";
import { dropIntentLabel, type BoardDropPreview } from "@/types/dnd-preview";
import type { TaskNode } from "@/types/task-node";

import { TagFilterBar } from "./tag-filter-bar";
import { TaskSearch } from "./task-search";
import { MindmapGrid } from "./mindmap-grid";
import { CardFieldVisibilityDialog } from "./card-field-visibility-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { FocusModeView } from "./focus-mode-view";
import { DepthLevelsControl } from "./depth-levels-control";
import { ImportSubtreeDialog } from "./import-subtree-dialog";
import { AppointmentsListDialog } from "./appointments-list-dialog";
import { BranchExportDialog, JsonExportPreviewDialog, JsonPasteImportDialog } from "./json-clipboard-dialog";
import { LevelNamesSetupDialog } from "./level-names-setup-dialog";
import { WorkingFileSync } from "./working-file-sync";
import { WorkingFileSetupDialog } from "./working-file-setup-dialog";
import { DataStoragePanel } from "./data-storage-panel";
import { PostImportSaveDialog } from "./post-import-save-dialog";
import { TaskEditorDialog } from "./task-editor-dialog";

/** Einfügelücke vor Karte; schmale Gap-Bänder liegen bewusst zwischen den Karten. */
const mindmapCollisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const pickTarget = (hits: ReturnType<typeof pointerWithin>) => {
    if (hits.length === 0) return null;
    const gapHit = hits.find((c) => String(c.id).startsWith(COLUMN_GAP_PREFIX));
    if (gapHit) return [gapHit];
    const cardHit = hits.find((c) => {
      const id = String(c.id);
      return id !== activeId && !id.startsWith(COLUMN_GAP_PREFIX);
    });
    return cardHit ? [cardHit] : null;
  };

  const pointerHits = pointerWithin(args);
  const fromPointer = pickTarget(pointerHits);
  if (fromPointer) return fromPointer;

  const rectHits = rectIntersection(args);
  const fromRect = pickTarget(rectHits);
  if (fromRect) return fromRect;

  return closestCorners(args);
};

function overToDragKind(over: Over, pathIds: string[]): TreeDragOverKind | null {
  const gap = parseColumnGapId(over.id);
  if (gap) {
    const col = over.data.current?.columnIndex as number | undefined;
    if (col == null || col !== gap.columnIndex) return null;
    const insertIdx = over.data.current?.insertIndex as number | undefined;
    if (insertIdx == null || insertIdx !== gap.insertIndex) return null;
    const rawLp = over.data.current?.listParentId as string | null | undefined;
    if (rawLp !== undefined && rawLp !== gap.listParentId) return null;
    return {
      kind: "columnGap",
      columnIndex: gap.columnIndex,
      insertIndex: gap.insertIndex,
      listParentId: gap.listParentId,
    };
  }
  const col = over.data.current?.columnIndex as number | undefined;
  if (col == null) return null;
  const raw = over.data.current?.listParentId;
  const listParentId =
    raw !== undefined
      ? (raw as string | null)
      : col === 0
        ? null
        : (pathIds[col - 1] ?? null);
  return { kind: "card", columnIndex: col, cardId: String(over.id), listParentId };
}

function buildPreview(
  roots: ReturnType<typeof useTaskTreeStore.getState>["roots"],
  pathIds: ReturnType<typeof useTaskTreeStore.getState>["pathIds"],
  activeId: string,
  over: Over,
): BoardDropPreview | null {
  const overKind = overToDragKind(over, pathIds);
  if (!overKind) return null;
  return buildMindmapDropPreview(roots, pathIds, activeId, overKind);
}

function DragPreviewCard({
  id,
  dropPreview,
}: {
  id: string;
  dropPreview: BoardDropPreview | null;
}) {
  const roots = useTaskTreeStore((s) => s.roots);
  const node = findNodeById(roots, id);
  if (!node) return null;
  const intent = dropPreview?.activeId === id ? dropPreview.intent : undefined;
  return (
    <div className="pointer-events-none w-72 max-w-[85vw] rounded-lg border border-slate-200 bg-white p-3 shadow-2xl ring-2 ring-sky-200/90">
      <p className="text-sm font-semibold text-slate-900">{node.title.trim() || "(Ohne Titel)"}</p>
      <p
        className={[
          "mt-1 text-[11px] font-medium",
          intent === "nest-under" ? "text-violet-700" : "text-sky-700",
        ].join(" ")}
      >
        {dropIntentLabel(intent)}
      </p>
    </div>
  );
}

export function TaskBoard() {
  const roots = useTaskTreeStore((s) => s.roots);
  const pathIds = useTaskTreeStore((s) => s.pathIds);
  const collapsedIds = useTaskTreeStore((s) => s.collapsedIds);
  const toggleNodeCollapsed = useTaskTreeStore((s) => s.toggleNodeCollapsed);
  const applyBoardDepthInView = useTaskTreeStore((s) => s.applyBoardDepthInView);
  const activateNode = useTaskTreeStore((s) => s.activateNode);
  const expandToNode = useTaskTreeStore((s) => s.expandToNode);
  const applyTreeDrag = useTaskTreeStore((s) => s.applyTreeDrag);
  const addCardAfter = useTaskTreeStore((s) => s.addCardAfter);
  const addCardAfterSibling = useTaskTreeStore((s) => s.addCardAfterSibling);
  const updateCard = useTaskTreeStore((s) => s.updateCard);
  const removeCard = useTaskTreeStore((s) => s.removeCard);
  const columnTitleOverrides = useTaskTreeStore((s) => s.columnTitleOverrides);
  const applyColumnTitleDraft = useTaskTreeStore((s) => s.applyColumnTitleDraft);
  const replaceBoardFromImport = useTaskTreeStore((s) => s.replaceBoardFromImport);
  const importSubtreeRoot = useTaskTreeStore((s) => s.importSubtreeRoot);
  const cardFieldVisibility = useTaskTreeStore((s) => s.cardFieldVisibility);
  const applyCardFieldVisibility = useTaskTreeStore((s) => s.applyCardFieldVisibility);
  const effortOnTasksEnabled = useTaskTreeStore((s) => s.effortOnTasksEnabled);
  const setEffortOnTasksEnabled = useTaskTreeStore((s) => s.setEffortOnTasksEnabled);
  const hideCompletedTasks = useTaskTreeStore((s) => s.hideCompletedTasks);
  const filterTags = useTaskTreeStore((s) => s.filterTags);
  const completedTag = useTaskTreeStore((s) => s.completedTag);
  const setCompletedTag = useTaskTreeStore((s) => s.setCompletedTag);
  const focusNodeId = useTaskTreeStore((s) => s.focusNodeId);
  const openFocusMode = useTaskTreeStore((s) => s.openFocusMode);
  const closeFocusMode = useTaskTreeStore((s) => s.closeFocusMode);

  const [searchFocusNodeId, setSearchFocusNodeId] = useState<string | null>(null);

  const [dropPreview, setDropPreview] = useState<BoardDropPreview | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [levelSetupOpen, setLevelSetupOpen] = useState(false);
  const [cardFieldsOpen, setCardFieldsOpen] = useState(false);
  const [pendingBoardImport, setPendingBoardImport] = useState<BoardSnapshotV1 | null>(null);
  const [pendingSubtreeImport, setPendingSubtreeImport] = useState<TaskNode | null>(null);
  const [workingFileName, setWorkingFileName] = useState<string | null>(null);
  const [workingFileDirty, setWorkingFileDirty] = useState(false);
  const [workingFileSaving, setWorkingFileSaving] = useState(false);
  /** Server + erste Client-Zeichnung false — gleiches Markup wie SSR, vermeidet Hydration-Mismatch. */
  const [fsAccessSupportedForUi, setFsAccessSupportedForUi] = useState(false);
  /** Nach useEffect: dynamische Tooltips (UA/Brave) erst clientseitig. */
  const [workingFileUiReady, setWorkingFileUiReady] = useState(false);
  const [workingFileSetupOpen, setWorkingFileSetupOpen] = useState(false);
  const [titleEditNodeId, setTitleEditNodeId] = useState<string | null>(null);
  const [boardJsonExportOpen, setBoardJsonExportOpen] = useState(false);
  const [pasteImportOpen, setPasteImportOpen] = useState(false);
  const [pasteSubtreeParentId, setPasteSubtreeParentId] = useState<string | null>(null);
  const [branchExportNode, setBranchExportNode] = useState<TaskNode | null>(null);
  const [appointmentsListOpen, setAppointmentsListOpen] = useState(false);
  const [scrollToNodeId, setScrollToNodeId] = useState<string | null>(null);
  const [dataStoragePanelOpen, setDataStoragePanelOpen] = useState(false);
  const [storagePanelBusy, setStoragePanelBusy] = useState(false);
  const [postImportSaveOpen, setPostImportSaveOpen] = useState(false);
  const [openWorkingFileConfirmOpen, setOpenWorkingFileConfirmOpen] = useState(false);
  const boardColumnsRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const dropPreviewRef = useRef<BoardDropPreview | null>(null);

  const onWorkingFileDirtyChange = useCallback((dirty: boolean) => {
    setWorkingFileDirty(dirty);
  }, []);

  const onNeedsWorkingFileSetup = useCallback(() => {
    setWorkingFileSetupOpen(true);
  }, []);

  useEffect(() => {
    setFsAccessSupportedForUi(isWorkingFileSupported());
    setWorkingFileUiReady(true);
  }, []);

  useEffect(() => {
    if (!scrollToNodeId) return;

    const reveal = () => {
      const path = pathFromRootToNode(roots, scrollToNodeId);
      if (path) {
        for (const id of path) {
          const onPath = document.querySelector(`[data-task-card-id="${id}"]`);
          if (onPath instanceof HTMLElement) {
            onPath.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
          }
        }
      }

      const target = document.querySelector(`[data-task-card-id="${scrollToNodeId}"]`);
      if (!(target instanceof HTMLElement)) return false;

      target.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      const board = boardColumnsRef.current;
      if (board) {
        const boardRect = board.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const targetLeft = targetRect.left - boardRect.left + board.scrollLeft;
        const targetRight = targetLeft + targetRect.width;
        const margin = 48;
        if (targetLeft < board.scrollLeft + margin) {
          board.scrollTo({ left: Math.max(0, targetLeft - margin), behavior: "smooth" });
        } else if (targetRight > board.scrollLeft + board.clientWidth - margin) {
          board.scrollTo({
            left: targetRight - board.clientWidth + margin,
            behavior: "smooth",
          });
        }
      }
      target.focus({ preventScroll: true });
      setScrollToNodeId(null);
      return true;
    };

    let frame = 0;
    const tryReveal = () => {
      if (reveal()) return;
      frame += 1;
      if (frame < 8) requestAnimationFrame(tryReveal);
    };
    requestAnimationFrame(tryReveal);
  }, [scrollToNodeId, roots]);

  const handleActivateBranch = useCallback(
    (nodeId: string) => {
      setSearchFocusNodeId((prev) => (prev !== null && prev !== nodeId ? null : prev));
      activateNode(nodeId);
    },
    [activateNode],
  );

  useEffect(() => {
    if (!focusNodeId) return;
    setSearchFocusNodeId(null);
    setTitleEditNodeId(null);
  }, [focusNodeId]);

  useEffect(() => {
    if (!focusNodeId) return;
    if (!findNodeById(roots, focusNodeId)) {
      closeFocusMode();
    }
  }, [focusNodeId, roots, closeFocusMode]);

  const handleCloseFocus = useCallback(() => {
    const nodeId = useTaskTreeStore.getState().focusNodeId;
    closeFocusMode();
    const { roots } = useTaskTreeStore.getState();
    if (!nodeId || !findNodeById(roots, nodeId)) return;
    expandToNode(nodeId);
    setSearchFocusNodeId(nodeId);
    setScrollToNodeId(nodeId);
  }, [closeFocusMode, expandToNode]);

  const handleSearchSelect = useCallback(
    (nodeId: string) => {
      expandToNode(nodeId);
      setSearchFocusNodeId(nodeId);
      setScrollToNodeId(nodeId);
    },
    [expandToNode],
  );

  const boardSnapshotTextFromStore = useCallback(() => boardJsonFromStoreState(), []);

  const attachWorkingFileLink = useCallback(
    async (createNew: boolean) => {
      if (!isWorkingFileSupported()) {
        window.alert(fileSystemAccessUnavailableMessage());
        return false;
      }
      try {
        const json = boardSnapshotTextFromStore();
        if (!createNew && isWorkingFileAttached() && isWorkingFileDirty()) {
          const saved = await writeWorkingFileJson(boardSnapshotTextFromStore());
          if (!saved.ok) {
            window.alert(
              "Dateiwechsel abgebrochen: ungespeicherte Änderungen konnten nicht in die aktuelle Datei geschrieben werden.",
            );
            return false;
          }
        }
        if (createNew) {
          const handle = await createAndAttachWorkingFile(json);
          if (!handle) return false;
          setWorkingFileName(handle.name?.trim() ? handle.name : "Arbeitsdatei");
          setWorkingFileSetupOpen(false);
          setWorkingFileDirty(false);
          return true;
        }
        const picked = await attachWorkingFileFromPicker();
        if (!picked) return false;
        setWorkingFileName(picked.handle.name?.trim() ? picked.handle.name : "Arbeitsdatei");
        setWorkingFileSetupOpen(false);
        if (picked.hydrate.status === "conflict") {
          const loadFile = window.confirm(
            "Die gewählte Datei unterscheidet sich von Ihrer aktuellen Ansicht.\n\nOK = Inhalt der Datei laden\nAbbrechen = Verknüpfung aufheben",
          );
          if (loadFile) {
            applyBoardJsonToStore(picked.hydrate.fileText);
            markWorkingFileSynced(picked.hydrate.fileText, picked.hydrate.fileLastModified);
            markWorkingFileSessionHydrated();
            setWorkingFileDirty(false);
          } else {
            await detachWorkingFile();
            setWorkingFileName(null);
            return false;
          }
        } else if (picked.hydrate.status === "pushed_local") {
          const result = await writeWorkingFileJson(boardSnapshotTextFromStore());
          if (!result.ok) window.alert("Speichern in die neue Arbeitsdatei ist fehlgeschlagen.");
          else setWorkingFileDirty(false);
        }
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return false;
        window.alert(err instanceof Error ? err.message : "Arbeitsdatei konnte nicht verknüpft werden.");
        return false;
      }
    },
    [boardSnapshotTextFromStore],
  );

  const runAttachWorkingFileWithBusy = useCallback(
    (createNew: boolean) => {
      setStoragePanelBusy(true);
      void attachWorkingFileLink(createNew).finally(() => setStoragePanelBusy(false));
    },
    [attachWorkingFileLink],
  );

  const beginAttachWorkingFile = useCallback(
    (createNew: boolean) => {
      if (!isWorkingFileSupported()) {
        window.alert(fileSystemAccessUnavailableMessage());
        return;
      }
      if (createNew) {
        runAttachWorkingFileWithBusy(true);
        return;
      }
      setOpenWorkingFileConfirmOpen(true);
    },
    [runAttachWorkingFileWithBusy],
  );

  const handleConfirmOpenWorkingFile = useCallback(() => {
    setOpenWorkingFileConfirmOpen(false);
    runAttachWorkingFileWithBusy(false);
  }, [runAttachWorkingFileWithBusy]);

  const handleChangeWorkingFile = useCallback(() => {
    beginAttachWorkingFile(false);
  }, [beginAttachWorkingFile]);

  const handlePostImportSaveToFile = useCallback(async () => {
    setPostImportSaveOpen(false);
    if (!isWorkingFileAttached()) {
      beginAttachWorkingFile(false);
      return;
    }
    const json = boardSnapshotTextFromStore();
    const result = await writeWorkingFileJson(json);
    if (!result.ok) window.alert("Speichern in die Arbeitsdatei ist fehlgeschlagen.");
    else setWorkingFileDirty(false);
  }, [beginAttachWorkingFile, boardSnapshotTextFromStore]);

  const openEditor = (id: string) => {
    setEditorNodeId(id);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorNodeId(null);
  };

  const handleOpenDetails = (nodeId: string) => {
    setTitleEditNodeId(null);
    openEditor(nodeId);
  };

  const handleTitleSave = (
    nodeId: string,
    title: string,
    meta?: { addSiblingAfter?: boolean },
  ) => {
    updateCard(nodeId, { title: title.trim() });
    if (meta?.addSiblingAfter) {
      const newId = addCardAfterSibling(nodeId);
      if (newId) {
        setTitleEditNodeId(newId);
        setScrollToNodeId(newId);
        return;
      }
    }
    setTitleEditNodeId(null);
  };

  const handleTitleEditCancel = (nodeId: string) => {
    const node = findNodeById(roots, nodeId);
    if (node && !node.title.trim()) {
      removeCard(nodeId);
    }
    setTitleEditNodeId(null);
  };

  const handleRequestDelete = (nodeId: string) => {
    setPendingDeleteId(nodeId);
  };

  const handleExportFullBoard = () => {
    const doc = buildBoardSnapshot(
      roots,
      pathIds,
      columnTitleOverrides,
      cardFieldVisibility,
      hideCompletedTasks,
      effortOnTasksEnabled,
      filterTags,
      completedTag,
      collapsedIds,
    );
    downloadJsonFile(STANDARD_WORKING_FILENAME, stringifyExportedDocument(doc));
  };

  const handleExportMindmapMm = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`task-board-${stamp}.mm`, taskRootsToFreemindMm(roots), "application/xml");
  };

  const applySubtreePastedText = (raw: string) => {
    const parentId = pasteSubtreeParentId;
    if (parentId === null) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      window.alert("Kein Inhalt.");
      return;
    }
    try {
      const doc = parseExportedDocument(trimmed);
      if (isBoardSnapshot(doc)) {
        window.alert(
          "Bitte Teilbaum-JSON (scope „subtree“) einfügen — keinen vollständigen Board-Export. Für das gesamte Board „Daten“ → Backup einspielen nutzen.",
        );
        return;
      }
      if (isSubtreeSnapshot(doc)) {
        importSubtreeRoot(parentId, taskNodeFromJson(doc.root));
        setPasteSubtreeParentId(null);
        expandToNode(parentId);
        return;
      }
      window.alert("Unbekanntes Format — erwartet wird Teilbaum-JSON (scope „subtree“).");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    }
  };

  const applyImportedText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      window.alert("Kein Inhalt.");
      return;
    }
    if (trimmed.startsWith("<")) {
      try {
        const mmRoots = parseFreemindMmToRoots(trimmed);
        const s = useTaskTreeStore.getState();
        setPendingBoardImport(
          buildBoardSnapshot(
            mmRoots,
            [],
            s.columnTitleOverrides,
            s.cardFieldVisibility,
            s.hideCompletedTasks,
            s.effortOnTasksEnabled,
            s.filterTags,
            s.completedTag,
            s.collapsedIds,
          ),
        );
        setPasteImportOpen(false);
        return;
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Mindmap-Import fehlgeschlagen.");
        return;
      }
    }
    try {
      const doc = parseExportedDocument(trimmed);
      if (isBoardSnapshot(doc)) {
        setPendingBoardImport(doc);
        setPasteImportOpen(false);
        return;
      }
      if (isSubtreeSnapshot(doc)) {
        setPendingSubtreeImport(taskNodeFromJson(doc.root));
        setPasteImportOpen(false);
        return;
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    }
  };

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    applyImportedText(text);
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    dropPreviewRef.current = null;
    setDropPreview(null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      dropPreviewRef.current = null;
      setDropPreview(null);
      return;
    }
    const activeId = String(active.id);
    const { roots: r, pathIds: p } = useTaskTreeStore.getState();
    const preview = buildPreview(r, p, activeId, over);
    const next = preview && preview.activeId === activeId ? preview : null;
    dropPreviewRef.current = next;
    setDropPreview(next);
  };

  const endDragUi = () => {
    dropPreviewRef.current = null;
    setDropPreview(null);
    setActiveDragId(null);
  };

  const onDragCancel = () => {
    endDragUi();
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const { roots: r, pathIds: p } = useTaskTreeStore.getState();
    const preview = dropPreviewRef.current;

    let overKind: TreeDragOverKind | null = null;
    if (preview?.activeId === activeId) {
      overKind = dragOverKindFromPreview(r, preview, p);
    } else if (over) {
      overKind = overToDragKind(over, p);
    }

    endDragUi();
    if (!overKind) return;

    applyTreeDrag(activeId, overKind);
  };

  const collapsedSet = useMemo(() => new Set(collapsedIds), [collapsedIds]);

  const boardMaxVisibleLevels = useMemo(
    () => getBoardMaxVisibleLevels(roots),
    [roots],
  );

  const mindmapDisplayRoots = useMemo(
    () =>
      rootsForMindmapDisplay(roots, {
        hideCompletedTasks,
        completedTag,
        filterTags,
      }),
    [roots, hideCompletedTasks, completedTag, filterTags],
  );

  const mindmapLayout = useMemo(
    () => getMindmapBoardLayout(mindmapDisplayRoots, collapsedSet),
    [mindmapDisplayRoots, collapsedSet],
  );

  const columnCount = mindmapLayout.columnCount;

  const boardExportJsonText = boardJsonExportOpen
    ? stringifyExportedDocument(
        buildBoardSnapshot(
          roots,
          pathIds,
          columnTitleOverrides,
          cardFieldVisibility,
          hideCompletedTasks,
          effortOnTasksEnabled,
          filterTags,
          completedTag,
          collapsedIds,
        ),
      )
    : "";

  /** Griff-Handle: kurze Bewegung reicht (kein Long-Press — der kämpft mit Scroll auf Mobilgeräten). */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 10 } }),
  );

  const workingFileAttached = isWorkingFileAttached();
  const workingFileHandle = getWorkingFileHandle();
  const workingFileLabel =
    workingFileName?.trim() ||
    (workingFileHandle?.name != null && workingFileHandle.name.trim() !== ""
      ? workingFileHandle.name
      : null);

  const storageDisplayStatus = useMemo(
    () =>
      deriveStorageDisplayStatus({
        workingFileLabel,
        workingFileAttached,
        workingFileDirty,
        workingFileSaving,
        fsAccessSupported: fsAccessSupportedForUi,
      }),
    [workingFileLabel, workingFileAttached, workingFileDirty, workingFileSaving, fsAccessSupportedForUi],
  );

  useEffect(() => {
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWorkingFile(workingFileDirty, workingFileAttached)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnOnLeave);
    return () => window.removeEventListener("beforeunload", warnOnLeave);
  }, [workingFileAttached, workingFileDirty]);

  const dataStorageTooltip = useMemo(
    () => formatStorageStatusTooltip(storageDisplayStatus),
    [storageDisplayStatus],
  );

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <WorkingFileSync
        onWorkingFileNameChange={setWorkingFileName}
        onDirtyChange={onWorkingFileDirtyChange}
        onSavingChange={setWorkingFileSaving}
        onNeedsFileSetup={onNeedsWorkingFileSetup}
      />
      {/* Header + Board in einer Spalte: Board kann den Header nicht überdecken (kein z-Index gegen Toolbar). */}
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-slate-200/80 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h1 className="shrink-0 text-lg font-semibold text-slate-900">T2</h1>
            <TaskSearch onSelectNode={handleSearchSelect} />
            {!focusNodeId && boardMaxVisibleLevels > 1 ? (
              <DepthLevelsControl
                maxLevel={boardMaxVisibleLevels}
                onApplyLevel={(level) => applyBoardDepthInView(level)}
                onExpandAll={() => applyBoardDepthInView(null)}
              />
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <input
              ref={importFileRef}
              type="file"
              accept=".json,application/json,.mm,text/xml,application/xml"
              className="hidden"
              aria-hidden
              onChange={handleImportFileChange}
            />
            <button
              type="button"
              onClick={() => setDataStoragePanelOpen(true)}
              className={dataStorageButtonClassName(storageDisplayStatus.tone)}
              title={dataStorageTooltip}
              aria-label={`Daten und Speicher: ${storageDisplayStatus.primaryLine}`}
            >
              <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden text-xs font-medium sm:inline">Daten</span>
            </button>
            <button
              type="button"
              onClick={() => setLevelSetupOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
              title="Ebenen umbenennen"
              aria-label="Ebenen umbenennen"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setCardFieldsOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
              title="Sichtbare Kartenfelder (außer Titel)"
              aria-label="Kartenfelder ein-/ausblenden"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
        <TagFilterBar onOpenAppointments={() => setAppointmentsListOpen(true)} />
      </header>

        {focusNodeId ? (
          <FocusModeView
            focusNodeId={focusNodeId}
            hideCompletedTasks={hideCompletedTasks}
            fieldVisibility={cardFieldVisibility}
            onClose={handleCloseFocus}
            onFocusNodeChange={openFocusMode}
            onOpenDetails={handleOpenDetails}
          />
        ) : (
        <DndContext
        id="task-board-dnd-aria"
        sensors={sensors}
        autoScroll
        collisionDetection={mindmapCollisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={boardColumnsRef}
            className={[
              "relative min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-4",
              activeDragId ? "touch-none" : "",
            ].join(" ")}
          >
            <MindmapGrid
              roots={mindmapDisplayRoots}
              columnCount={columnCount}
              columnTitleOverrides={columnTitleOverrides}
              collapsedIds={collapsedSet}
              searchFocusNodeId={searchFocusNodeId}
              onPasteSubtreeUnder={setPasteSubtreeParentId}
              onAddRootCard={() => {
                const id = addCardAfter(null);
                setTitleEditNodeId(id);
                setScrollToNodeId(id);
              }}
              onAddChildCard={(parentId) => {
                const id = addCardAfter(parentId);
                expandToNode(id);
                setTitleEditNodeId(id);
                setScrollToNodeId(id);
              }}
              onOpenDetails={handleOpenDetails}
              onToggleCollapsed={toggleNodeCollapsed}
              titleEditNodeId={titleEditNodeId}
              onTitleSave={handleTitleSave}
              onTitleEditCancel={handleTitleEditCancel}
              onActivateBranch={handleActivateBranch}
              dropPreview={dropPreview}
              fieldVisibility={cardFieldVisibility}
              onCopySubtree={(node) => setBranchExportNode(node)}
              onRequestDelete={handleRequestDelete}
            />
          </div>
        </div>

        <DragOverlay zIndex={40}>
          {activeDragId ? <DragPreviewCard id={activeDragId} dropPreview={dropPreview} /> : null}
        </DragOverlay>
        </DndContext>
        )}
      </div>

      <JsonExportPreviewDialog
        open={boardJsonExportOpen}
        title="Backup als JSON (Kopieren)"
        hint="Identisch mit „Backup erstellen“ — ändert weder Server noch Arbeitsdatei. Text markieren oder kopieren."
        jsonText={boardExportJsonText}
        onClose={() => setBoardJsonExportOpen(false)}
      />
      <BranchExportDialog
        open={branchExportNode !== null}
        root={branchExportNode}
        completedTag={completedTag}
        effortOnTasksEnabled={effortOnTasksEnabled}
        onClose={() => setBranchExportNode(null)}
      />
      <AppointmentsListDialog
        open={appointmentsListOpen}
        onClose={() => setAppointmentsListOpen(false)}
      />
      <JsonPasteImportDialog
        open={pasteImportOpen}
        title="Backup einspielen (Text)"
        hint="Board-JSON (scope „board“), Teilbaum-JSON (scope „subtree“) oder FreeMind-/Freeplane-XML (.mm). Ein vollständiges Board ersetzt alle Karten nach Bestätigung."
        onClose={() => setPasteImportOpen(false)}
        onApplyPastedText={applyImportedText}
      />
      <JsonPasteImportDialog
        open={pasteSubtreeParentId !== null}
        title={
          pasteSubtreeParentId !== null
            ? `Teilbaum einfügen unter „${findNodeById(roots, pasteSubtreeParentId)?.title?.trim() || "Karte"}“`
            : "Teilbaum einfügen"
        }
        hint="Teilbaum-JSON (scope „subtree“), wie beim Kopieren eines Astes. Wird als Kind(er) der gewählten Karte eingefügt; alle IDs werden neu vergeben."
        onClose={() => setPasteSubtreeParentId(null)}
        onApplyPastedText={applySubtreePastedText}
      />
      <ImportSubtreeDialog
        open={pendingSubtreeImport !== null}
        rootTitle={pendingSubtreeImport?.title ?? ""}
        parentOptions={flattenNodesForParentSelect(roots)}
        onCancel={() => setPendingSubtreeImport(null)}
        onConfirm={(parentId) => {
          const root = pendingSubtreeImport;
          if (!root) return;
          importSubtreeRoot(parentId, root);
          setPendingSubtreeImport(null);
        }}
      />
      <ConfirmDialog
        open={openWorkingFileConfirmOpen}
        title="Bestehende Arbeitsdatei öffnen?"
        message={
          "Die gewählte JSON-Datei ersetzt die aktuelle Board-Ansicht in T2, sofern sich die Stände unterscheiden.\n\nBei Konflikten werden Sie gefragt — nichts wird still überschrieben.\n\nUm den aktuellen Stand in eine neue Datei zu schreiben, wählen Sie „Neue Datei“."
        }
        confirmLabel="Datei öffnen"
        cancelLabel="Abbrechen"
        confirmClassName="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        onCancel={() => setOpenWorkingFileConfirmOpen(false)}
        onConfirm={handleConfirmOpenWorkingFile}
      />
      <ConfirmDialog
        open={pendingBoardImport !== null}
        title="Backup einspielen?"
        message={
          pendingBoardImport
            ? `Alle Karten, Drill-Pfad, Ebenen-Namen und Einstellungen werden ersetzt (${pendingBoardImport.roots.length} Wurzelkarten). Die Arbeitsdatei wird nicht automatisch angepasst — danach können Sie speichern. Nicht rückgängig machbar.`
            : ""
        }
        confirmLabel="Einspielen"
        cancelLabel="Abbrechen"
        confirmClassName="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        onCancel={() => setPendingBoardImport(null)}
        onConfirm={() => {
          const snap = pendingBoardImport;
          setPendingBoardImport(null);
          if (!snap) return;
          replaceBoardFromImport(boardSnapshotToReplacePayload(snap));
          closeEditor();
          setPostImportSaveOpen(true);
        }}
      />
      <PostImportSaveDialog
        open={postImportSaveOpen}
        workingFileAttached={workingFileAttached}
        onWriteToFile={() => void handlePostImportSaveToFile()}
        onDismiss={() => setPostImportSaveOpen(false)}
      />
      <WorkingFileSetupDialog
        open={workingFileSetupOpen && !workingFileAttached}
        fsAccessSupported={fsAccessSupportedForUi}
        unavailableMessage={fileSystemAccessUnavailableMessage()}
        onOpenExisting={() => beginAttachWorkingFile(false)}
        onCreateNew={() => beginAttachWorkingFile(true)}
      />
      <DataStoragePanel
        open={dataStoragePanelOpen}
        onClose={() => setDataStoragePanelOpen(false)}
        fsAccessSupported={fsAccessSupportedForUi}
        workingFileUiReady={workingFileUiReady}
        workingFileUnavailableTooltip={fileSystemAccessUnavailableTooltip()}
        workingFileLabel={workingFileLabel}
        workingFileAttached={workingFileAttached}
        workingFileDirty={workingFileDirty}
        workingFileSaving={workingFileSaving}
        busy={storagePanelBusy}
        onOpenWorkingFile={() => beginAttachWorkingFile(false)}
        onCreateWorkingFile={() => beginAttachWorkingFile(true)}
        onChangeWorkingFile={handleChangeWorkingFile}
        onCreateBackup={() => {
          handleExportFullBoard();
        }}
        onRestoreBackupFile={() => {
          setDataStoragePanelOpen(false);
          importFileRef.current?.click();
        }}
        onRestoreBackupPaste={() => {
          setDataStoragePanelOpen(false);
          setPasteImportOpen(true);
        }}
        onExportMindmap={() => {
          handleExportMindmapMm();
        }}
        onShowJsonCopy={() => {
          setDataStoragePanelOpen(false);
          setBoardJsonExportOpen(true);
        }}
      />
      <LevelNamesSetupDialog
        open={levelSetupOpen}
        columnCount={columnCount}
        overrides={columnTitleOverrides}
        onClose={() => setLevelSetupOpen(false)}
        onApply={applyColumnTitleDraft}
      />
      <CardFieldVisibilityDialog
        open={cardFieldsOpen}
        value={cardFieldVisibility}
        effortOnTasksEnabled={effortOnTasksEnabled}
        completedTag={completedTag}
        onClose={() => setCardFieldsOpen(false)}
        onApply={(next, effortOn, doneTag) => {
          applyCardFieldVisibility(next);
          setEffortOnTasksEnabled(effortOn);
          setCompletedTag(doneTag);
        }}
      />
      <TaskEditorDialog
        open={editorOpen}
        nodeId={editorNodeId}
        onClose={closeEditor}
        onSave={(id, fields, meta) => {
          updateCard(id, fields);
          if (meta?.addSiblingAfter) {
            const newId = addCardAfterSibling(id);
            if (newId) {
              setEditorNodeId(newId);
              setScrollToNodeId(newId);
            }
          }
        }}
        onRequestDelete={
          editorNodeId
            ? () => {
                handleRequestDelete(editorNodeId);
              }
            : undefined
        }
      />
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Karte löschen?"
        message={
          pendingDeleteId
            ? `„${findNodeById(roots, pendingDeleteId)?.title ?? "Diese Karte"}“ und alle Unteraufgaben endgültig löschen?`
            : ""
        }
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const id = pendingDeleteId;
          const editing = editorNodeId;
          setPendingDeleteId(null);
          if (!id) return;
          removeCard(id);
          if (editing === id) closeEditor();
        }}
      />
    </div>
  );
}
