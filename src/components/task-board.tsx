"use client";

import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CircleHelp, HardDrive, Settings2, SlidersHorizontal, Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  BoardBackupSync,
  runManualBoardBackup,
} from "@/components/board-backup-sync";
import {
  backupBeforeSuspiciousSwitch,
  boardHasBackupContent,
  readBackupIntervalMinutes,
  writeBackupIntervalMinutes,
  type BackupIntervalMinutes,
  getLocalBackup,
} from "@/lib/board-backup";
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
  attachWorkingFileFromBrowserFile,
  attachWorkingFileFromPastedText,
  attachWorkingFileOpen,
  beginUserPickedFileRead,
  bindMobileWorkingFile,
  readUserPickedFileText,
  userFacingFileReadError,
  createAndAttachWorkingFile,
  detachWorkingFile,
  fileSystemAccessUnavailableMessage,
  fileSystemAccessUnavailableTooltip,
  forceApplyBoardJson,
  getWorkingFileHandle,
  getRememberedWorkingFileName,
  getWorkingFileLabel,
  hydrateStoreFromWorkingFile,
  isMobileWorkingFileMode,
  isWorkingFileAttached,
  isWorkingFileDirty,
  isWorkingFileSupported,
  isWorkingFileUiAvailable,
  markWorkingFileSessionHydrated,
  markWorkingFileSynced,
  openRecentWorkingFile,
  persistWorkingFileJson,
  prefersBrowserFilePicker,
  requestWorkingFilePermission,
  saveWorkingFileAs,
  suggestedWorkingFileName,
  STANDARD_WORKING_FILENAME,
} from "@/lib/working-file";
import {
  findNodeById,
  pathFromRootToNode,
  rootsForMindmapDisplay,
} from "@/lib/tree-utils";
import { getBoardMaxVisibleLevels } from "@/lib/tree-depth-collapse";
import {
  firstContextCardId,
  focusTargetAfterRemoving,
  navigateContextCard,
  shouldIgnoreCardKeyboard,
} from "@/lib/card-keyboard-nav";
import {
  contextChildren,
  contextPathNodes,
} from "@/lib/board-context";
import {
  parseContextGapId,
  type ContextListDrop,
} from "@/lib/context-list-dnd";
import {
  boardNodeIdFromDragActive,
  outlineDropFromOverId,
  parseOutlineNestId,
} from "@/lib/outline-dnd";
import {
  CLIPBOARD_DROP_TARGET_ID,
  CLIPBOARD_SIDEBAR_DROP_ID,
  findNodeForestLocation,
  forestDropTargetFromOverId,
  parseClipboardGapId,
} from "@/lib/clipboard-dnd";
import { saveClipboardLinkToCard } from "@/lib/paste-card-link-from-clipboard";
import {
  dataStorageButtonClassName,
  deriveStorageDisplayStatus,
  formatStorageStatusTooltip,
  hasUnsavedWorkingFile,
} from "@/lib/storage-coordinator";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskNode } from "@/types/task-node";

import { TagFilterBar } from "./tag-filter-bar";
import { ClipboardDropTarget } from "./clipboard-drop-target";
import { ClipboardSidebar } from "./clipboard-sidebar";
import { TaskSearch } from "./task-search";
import { BreadcrumbTrail } from "./breadcrumb-trail";
import { OutlineRail } from "./outline-rail";
import { ContextCardList } from "./context-card-list";
import { CardFieldVisibilityDialog } from "./card-field-visibility-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { DepthLevelsControl } from "./depth-levels-control";
import { ImportSubtreeDialog } from "./import-subtree-dialog";
import { AppointmentsListDialog } from "./appointments-list-dialog";
import { BranchExportDialog, JsonExportPreviewDialog, JsonPasteImportDialog } from "./json-clipboard-dialog";
import { PasteListDialog } from "./paste-list-dialog";
import { LevelNamesSetupDialog } from "./level-names-setup-dialog";
import { TagRenameDialog } from "./tag-rename-dialog";
import { WorkingFileSync } from "./working-file-sync";
import { WorkingFileSetupDialog } from "./working-file-setup-dialog";
import { DataStoragePanel } from "./data-storage-panel";
import { PostImportSaveDialog } from "./post-import-save-dialog";
import { TaskEditorDialog } from "./task-editor-dialog";
import { KeyboardShortcutsHelpDialog } from "./keyboard-shortcuts-help-dialog";


function pointInClientRect(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

const boardCollisionDetection: CollisionDetection = (args) => {
  const activeSource = args.active.data.current?.source as string | undefined;
  const { pointerCoordinates, droppableContainers, droppableRects } = args;

  const collisionFor = (container: (typeof droppableContainers)[number]) => [
    { id: container.id, data: { droppableContainer: container, value: 0 } },
  ];

  if (pointerCoordinates) {
    for (const container of droppableContainers) {
      const kind = container.data.current?.kind as string | undefined;
      if (kind !== "clipboardGap" && kind !== "clipboardCard") continue;
      const rect = droppableRects.get(container.id);
      if (!rect || !pointInClientRect(pointerCoordinates, rect)) continue;
      return collisionFor(container);
    }
    if (activeSource !== "clipboard") {
      for (const id of [CLIPBOARD_DROP_TARGET_ID, CLIPBOARD_SIDEBAR_DROP_ID]) {
        const rect = droppableRects.get(id);
        const container = droppableContainers.find((c) => String(c.id) === id);
        if (rect && container && pointInClientRect(pointerCoordinates, rect)) {
          return collisionFor(container);
        }
      }
    }
  }

  const hits = pointerWithin(args);
  if (hits.length > 0) {
    const clip = hits.find(
      (c) =>
        String(c.id) === CLIPBOARD_DROP_TARGET_ID ||
        String(c.id) === CLIPBOARD_SIDEBAR_DROP_ID ||
        String(c.id).startsWith("clipboard-gap:"),
    );
    if (clip && activeSource !== "clipboard") return [clip];
    const outlineGap = hits.find((c) => String(c.id).startsWith("outline-gap:"));
    if (outlineGap) return [outlineGap];
    const outlineNest = hits.find(
      (c) => c.data?.droppableContainer?.data?.current?.kind === "outlineNest",
    );
    if (outlineNest) return [outlineNest];
    const nest = hits.find((c) => c.data?.droppableContainer?.data?.current?.kind === "contextNest");
    if (nest) return [nest];
    const gap = hits.find((c) => String(c.id).startsWith("context-gap:"));
    if (gap) return [gap];
    return [hits[0]];
  }
  return closestCenter(args);
};

function DragPreviewCard({ id }: { id: string }) {
  const roots = useTaskTreeStore((s) => s.roots);
  const clipboardRoots = useTaskTreeStore((s) => s.clipboardRoots);
  const nodeId = boardNodeIdFromDragActive(id) ?? id;
  const node = findNodeById(roots, nodeId) ?? findNodeById(clipboardRoots, nodeId);
  if (!node) return null;
  return (
    <div className="pointer-events-none w-72 max-w-[85vw] rounded-lg border border-slate-200 bg-white p-3 shadow-2xl ring-2 ring-sky-200/90">
      <p className="text-sm font-semibold text-slate-900">{node.title.trim() || "(Ohne Titel)"}</p>
      {node.children.length > 0 ? (
        <p className="mt-1 text-[11px] text-slate-500">
          inkl. {node.children.length} direkte Unterkarte
          {node.children.length === 1 ? "" : "n"}
        </p>
      ) : null}
    </div>
  );
}

export function TaskBoard() {
  const roots = useTaskTreeStore((s) => s.roots);
  const collapsedIds = useTaskTreeStore((s) => s.collapsedIds);
  const toggleNodeCollapsed = useTaskTreeStore((s) => s.toggleNodeCollapsed);
  const applyBoardDepthInView = useTaskTreeStore((s) => s.applyBoardDepthInView);
  const expandToNode = useTaskTreeStore((s) => s.expandToNode);
  const contextNodeId = useTaskTreeStore((s) => s.contextNodeId);
  const setContextNodeId = useTaskTreeStore((s) => s.setContextNodeId);
  const drillIntoNode = useTaskTreeStore((s) => s.drillIntoNode);
  const drillUp = useTaskTreeStore((s) => s.drillUp);
  const applyContextListDrag = useTaskTreeStore((s) => s.applyContextListDrag);
  const applyOutlineDrag = useTaskTreeStore((s) => s.applyOutlineDrag);
  const applyUnifiedDrag = useTaskTreeStore((s) => s.applyUnifiedDrag);
  const clearClipboard = useTaskTreeStore((s) => s.clearClipboard);
  const clipboardRoots = useTaskTreeStore((s) => s.clipboardRoots);
  const addCardAfter = useTaskTreeStore((s) => s.addCardAfter);
  const addCardAfterSibling = useTaskTreeStore((s) => s.addCardAfterSibling);
  const updateCard = useTaskTreeStore((s) => s.updateCard);
  const removeCard = useTaskTreeStore((s) => s.removeCard);
  const columnTitleOverrides = useTaskTreeStore((s) => s.columnTitleOverrides);
  const applyColumnTitleDraft = useTaskTreeStore((s) => s.applyColumnTitleDraft);
  const replaceBoardFromImport = useTaskTreeStore((s) => s.replaceBoardFromImport);
  const importSubtreeRoot = useTaskTreeStore((s) => s.importSubtreeRoot);
  const importPastedCards = useTaskTreeStore((s) => s.importPastedCards);
  const cardFieldVisibility = useTaskTreeStore((s) => s.cardFieldVisibility);
  const applyCardFieldVisibility = useTaskTreeStore((s) => s.applyCardFieldVisibility);
  const effortOnTasksEnabled = useTaskTreeStore((s) => s.effortOnTasksEnabled);
  const setEffortOnTasksEnabled = useTaskTreeStore((s) => s.setEffortOnTasksEnabled);
  const hideCompletedTasks = useTaskTreeStore((s) => s.hideCompletedTasks);
  const filterTags = useTaskTreeStore((s) => s.filterTags);
  const completedTag = useTaskTreeStore((s) => s.completedTag);
  const setCompletedTag = useTaskTreeStore((s) => s.setCompletedTag);

  const [searchFocusNodeId, setSearchFocusNodeId] = useState<string | null>(null);
  const [keyboardFocusNodeId, setKeyboardFocusNodeId] = useState<string | null>(null);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [nestDropTargetId, setNestDropTargetId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [levelSetupOpen, setLevelSetupOpen] = useState(false);
  const [cardFieldsOpen, setCardFieldsOpen] = useState(false);
  const [tagRenameOpen, setTagRenameOpen] = useState(false);
  const [pendingBoardImport, setPendingBoardImport] = useState<BoardSnapshotV1 | null>(null);
  const [pendingSubtreeImport, setPendingSubtreeImport] = useState<TaskNode | null>(null);
  const [workingFileName, setWorkingFileName] = useState<string | null>(() =>
    typeof window !== "undefined" ? getRememberedWorkingFileName() : null,
  );
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
  const [workingFilePasteOpen, setWorkingFilePasteOpen] = useState(false);
  const [pasteSubtreeParentId, setPasteSubtreeParentId] = useState<string | null>(null);
  const [pasteListParentId, setPasteListParentId] = useState<string | null>(null);
  const [branchExportNode, setBranchExportNode] = useState<TaskNode | null>(null);
  const [appointmentsListOpen, setAppointmentsListOpen] = useState(false);
  const [scrollToNodeId, setScrollToNodeId] = useState<string | null>(null);
  const [dataStoragePanelOpen, setDataStoragePanelOpen] = useState(false);
  const [storagePanelBusy, setStoragePanelBusy] = useState(false);
  const [postImportSaveOpen, setPostImportSaveOpen] = useState(false);
  const [openWorkingFileConfirmOpen, setOpenWorkingFileConfirmOpen] = useState(false);
  const [backupIntervalMinutes, setBackupIntervalMinutes] = useState<BackupIntervalMinutes>(0);
  const [backupLastLabel, setBackupLastLabel] = useState("Noch kein Backup");
  const [helpOpen, setHelpOpen] = useState(false);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [clearClipboardConfirmOpen, setClearClipboardConfirmOpen] = useState(false);
  const [clipboardOverGap, setClipboardOverGap] = useState<{
    listParentId: string | null;
    insertIndex: number;
  } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const workingFilePickRef = useRef<HTMLInputElement>(null);

  const onWorkingFileDirtyChange = useCallback((dirty: boolean) => {
    setWorkingFileDirty(dirty);
  }, []);

  const onNeedsWorkingFileSetup = useCallback(() => {
    setWorkingFileSetupOpen(true);
  }, []);

  useEffect(() => {
    setFsAccessSupportedForUi(isWorkingFileUiAvailable());
    setWorkingFileUiReady(true);
    setBackupIntervalMinutes(readBackupIntervalMinutes());
  }, []);

  useEffect(() => {
    if (!scrollToNodeId) return;
    const reveal = () => {
      const target = document.querySelector(
        `[data-task-card-id="${CSS.escape(scrollToNodeId)}"]`,
      );
      if (!(target instanceof HTMLElement)) return false;
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  }, [scrollToNodeId]);

  const handleSearchSelect = useCallback(
    (nodeId: string) => {
      expandToNode(nodeId);
      setSearchFocusNodeId(nodeId);
      setKeyboardFocusNodeId(nodeId);
      setScrollToNodeId(nodeId);
    },
    [expandToNode],
  );

  const handleKeyboardFocus = useCallback((nodeId: string) => {
    setKeyboardFocusNodeId(nodeId);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const boardSnapshotTextFromStore = useCallback(() => boardJsonFromStoreState(), []);

  const attachWorkingFileLink = useCallback(
    async (createNew: boolean) => {
      if (createNew && prefersBrowserFilePicker()) {
        downloadJsonFile(STANDARD_WORKING_FILENAME, boardSnapshotTextFromStore());
        window.alert(
          `„${STANDARD_WORKING_FILENAME}“ wurde heruntergeladen.\n\nLegen Sie die Datei in Ihren Proton-Drive-Ordner und wählen Sie danach „JSON-Datei auswählen“.`,
        );
        return true;
      }

      if (!isWorkingFileUiAvailable()) {
        window.alert(fileSystemAccessUnavailableMessage());
        return false;
      }
      try {
        const json = boardSnapshotTextFromStore();
        if (!createNew && isWorkingFileAttached() && isWorkingFileDirty()) {
          const saved = await persistWorkingFileJson(boardSnapshotTextFromStore());
          if (!saved.ok) {
            window.alert(
              "Dateiwechsel abgebrochen: ungespeicherte Änderungen konnten nicht gespeichert werden.",
            );
            return false;
          }
        }
        if (createNew) {
          const suggested = suggestedWorkingFileName(
            getWorkingFileLabel() || roots[0]?.title || undefined,
          );
          const handle = await createAndAttachWorkingFile(json, suggested);
          if (!handle) return false;
          setWorkingFileName(handle.name?.trim() ? handle.name : "Arbeitsdatei");
          setWorkingFileSetupOpen(false);
          setWorkingFileDirty(false);
          return true;
        }
        // Picker needs user activation — run before any safety-download click.
        const handle = await attachWorkingFileOpen();
        if (!handle) return false;
        backupBeforeSuspiciousSwitch("file");
        const hydrate = await hydrateStoreFromWorkingFile(handle);
        setWorkingFileName(handle.name?.trim() ? handle.name : "Arbeitsdatei");
        setWorkingFileSetupOpen(false);
        if (hydrate.status === "conflict") {
          const loadFile = window.confirm(
            "Die gewählte Datei unterscheidet sich von Ihrer aktuellen Ansicht.\n\nOK = Inhalt der Datei laden\nAbbrechen = Verknüpfung aufheben",
          );
          if (loadFile) {
            applyBoardJsonToStore(hydrate.fileText);
            markWorkingFileSynced(hydrate.fileText, hydrate.fileLastModified);
            markWorkingFileSessionHydrated();
            setWorkingFileDirty(false);
          } else {
            await detachWorkingFile();
            setWorkingFileName(null);
            return false;
          }
        } else if (hydrate.status === "pushed_local") {
          const result = await persistWorkingFileJson(boardSnapshotTextFromStore());
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
    [boardSnapshotTextFromStore, roots],
  );

  const attachWorkingFileFromMobilePicker = useCallback(
    async (file: File, preReadText?: string) => {
      setStoragePanelBusy(true);
      try {
        backupBeforeSuspiciousSwitch("file");
        const result = await attachWorkingFileFromBrowserFile(file, preReadText);
        if (result.status === "read_error") {
          window.alert(result.message);
          return false;
        }
        if (result.status === "conflict") {
          const loadFile = window.confirm(
            "Die gewählte Datei unterscheidet sich von Ihrer aktuellen Ansicht.\n\nOK = Inhalt der Datei laden\nAbbrechen = Abbrechen",
          );
          if (!loadFile) return false;
          const text = preReadText ?? (await readUserPickedFileText(file));
          applyBoardJsonToStore(text);
          await bindMobileWorkingFile(file, text);
        } else if (result.status === "pushed_local") {
          const saved = await persistWorkingFileJson(boardSnapshotTextFromStore());
          if (!saved.ok) {
            window.alert("Speichern ist fehlgeschlagen.");
            return false;
          }
        }
        setWorkingFileName(getWorkingFileLabel());
        setWorkingFileSetupOpen(false);
        setWorkingFileDirty(false);
        return true;
      } catch (err) {
        window.alert(userFacingFileReadError(err));
        return false;
      } finally {
        setStoragePanelBusy(false);
      }
    },
    [boardSnapshotTextFromStore],
  );

  const applyWorkingFilePastedText = useCallback(
    async (text: string) => {
      setWorkingFilePasteOpen(false);
      setStoragePanelBusy(true);
      try {
        const result = await attachWorkingFileFromPastedText(text);
        if (result.status === "read_error") {
          window.alert(result.message);
          return;
        }
        if (result.status === "conflict") {
          const loadFile = window.confirm(
            "Der eingefügte Text unterscheidet sich von Ihrer aktuellen Ansicht.\n\nOK = Eingefügten Stand laden\nAbbrechen = Abbrechen",
          );
          if (!loadFile) return;
          applyBoardJsonToStore(text);
          await attachWorkingFileFromPastedText(text);
        } else if (result.status === "pushed_local") {
          const saved = await persistWorkingFileJson(boardSnapshotTextFromStore());
          if (!saved.ok) window.alert("Speichern ist fehlgeschlagen.");
        }
        setWorkingFileName(getWorkingFileLabel());
        setWorkingFileSetupOpen(false);
        setWorkingFileDirty(false);
      } finally {
        setStoragePanelBusy(false);
      }
    },
    [boardSnapshotTextFromStore],
  );

  const handleWorkingFilePickChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const file = input.files?.[0];
      if (!file) return;

      const readPromise = beginUserPickedFileRead(file);

      void (async () => {
        try {
          const text = await readPromise;
          await attachWorkingFileFromMobilePicker(file, text);
        } catch (err) {
          window.alert(userFacingFileReadError(err));
        } finally {
          input.value = "";
        }
      })();
    },
    [attachWorkingFileFromMobilePicker],
  );

  const runAttachWorkingFileWithBusy = useCallback(
    (createNew: boolean) => {
      setStoragePanelBusy(true);
      void attachWorkingFileLink(createNew).finally(() => setStoragePanelBusy(false));
    },
    [attachWorkingFileLink],
  );

  const ensureSavedBeforeOpen = useCallback((): boolean => {
    const attached = isWorkingFileAttached();
    const dirty = isWorkingFileDirty();
    const unsavedWithoutFile = !attached && boardHasBackupContent();
    if (!dirty && !unsavedWithoutFile) return true;
    window.alert(
      attached
        ? "Es gibt ungespeicherte Änderungen. Bitte zuerst speichern, bevor du eine andere Datei oder ein Backup öffnest."
        : "Das Board ist noch nicht gespeichert. Bitte zuerst „Speichern unter…“ wählen, bevor du eine andere Datei oder ein Backup öffnest.",
    );
    setDataStoragePanelOpen(true);
    return false;
  }, []);

  const beginAttachWorkingFile = useCallback(
    (createNew: boolean, options?: { skipConfirm?: boolean }) => {
      if (createNew) {
        if (prefersBrowserFilePicker()) {
          setWorkingFileSetupOpen(false);
          void attachWorkingFileLink(true);
          return;
        }
        if (!isWorkingFileSupported()) {
          window.alert(fileSystemAccessUnavailableMessage());
          return;
        }
        runAttachWorkingFileWithBusy(true);
        return;
      }

      if (!isWorkingFileAttached() && boardHasBackupContent()) {
        if (!ensureSavedBeforeOpen()) return;
      }

      if (!options?.skipConfirm && isWorkingFileAttached()) {
        setOpenWorkingFileConfirmOpen(true);
        return;
      }
      setWorkingFileSetupOpen(false);
      if (isWorkingFileSupported()) {
        runAttachWorkingFileWithBusy(false);
        return;
      }
      if (prefersBrowserFilePicker()) {
        workingFilePickRef.current?.click();
        return;
      }
      window.alert(fileSystemAccessUnavailableMessage());
    },
    [attachWorkingFileLink, ensureSavedBeforeOpen, runAttachWorkingFileWithBusy],
  );

  const handleConfirmOpenWorkingFile = useCallback(() => {
    setOpenWorkingFileConfirmOpen(false);
    runAttachWorkingFileWithBusy(false);
  }, [runAttachWorkingFileWithBusy]);

  const handleChangeWorkingFile = useCallback(() => {
    beginAttachWorkingFile(false);
  }, [beginAttachWorkingFile]);

  const handleExportWorkingFileForSync = useCallback(() => {
    const name = getWorkingFileLabel() || STANDARD_WORKING_FILENAME;
    downloadJsonFile(name, boardSnapshotTextFromStore());
  }, [boardSnapshotTextFromStore]);

  const handleSaveWorkingFileAs = useCallback(async () => {
    setStoragePanelBusy(true);
    try {
      if (!isWorkingFileSupported()) {
        window.alert(
          "Speichern unter… braucht die File-System-API (Chrome, Edge oder Brave). Alternativ „Jetzt sichern“ nutzen.",
        );
        return;
      }
      const suggested = suggestedWorkingFileName(
        getWorkingFileLabel() || roots[0]?.title || undefined,
      );
      const handle = await saveWorkingFileAs(boardSnapshotTextFromStore(), suggested);
      if (handle) {
        setWorkingFileName(getWorkingFileLabel());
        setWorkingFileDirty(false);
        setWorkingFileSetupOpen(false);
        setDataStoragePanelOpen(false);
      }
    } finally {
      setStoragePanelBusy(false);
    }
  }, [boardSnapshotTextFromStore, roots]);

  const handlePostImportSaveToFile = useCallback(async () => {
    setPostImportSaveOpen(false);
    if (!isWorkingFileAttached()) {
      await handleSaveWorkingFileAs();
      return;
    }
    const json = boardSnapshotTextFromStore();
    const result = await persistWorkingFileJson(json);
    if (!result.ok) window.alert("Speichern in die Arbeitsdatei ist fehlgeschlagen.");
    else setWorkingFileDirty(false);
  }, [boardSnapshotTextFromStore, handleSaveWorkingFileAs]);

  const handleOpenRecentWorkingFile = useCallback(
    async (handle: FileSystemFileHandle) => {
      if (!ensureSavedBeforeOpen()) return;
      setStoragePanelBusy(true);
      try {
        const permitted = await requestWorkingFilePermission(handle);
        if (!permitted) {
          window.alert(
            "Datei konnte nicht geöffnet werden. Bitte Berechtigung erteilen oder die Datei erneut über „Datei öffnen“ wählen.",
          );
          return;
        }
        backupBeforeSuspiciousSwitch("file");
        const result = await openRecentWorkingFile(handle, { skipPermission: true });
        if (!result) {
          window.alert(
            "Datei konnte nicht geöffnet werden. Bitte die Datei erneut über „Datei öffnen“ wählen.",
          );
          return;
        }
        if (result.hydrate.status === "conflict") {
          const loadFile = window.confirm(
            "Die gewählte Datei unterscheidet sich von Ihrer aktuellen Ansicht.\n\nOK = Inhalt der Datei laden\nAbbrechen = Abbrechen",
          );
          if (loadFile) {
            applyBoardJsonToStore(result.hydrate.fileText);
            markWorkingFileSynced(result.hydrate.fileText, result.hydrate.fileLastModified);
            markWorkingFileSessionHydrated();
            setWorkingFileDirty(false);
          } else {
            return;
          }
        } else if (result.hydrate.status === "pushed_local") {
          const saved = await persistWorkingFileJson(boardSnapshotTextFromStore());
          if (!saved.ok) window.alert("Speichern in die Arbeitsdatei ist fehlgeschlagen.");
          else setWorkingFileDirty(false);
        }
        setWorkingFileName(getWorkingFileLabel());
        setWorkingFileSetupOpen(false);
        setDataStoragePanelOpen(false);
      } finally {
        setStoragePanelBusy(false);
      }
    },
    [boardSnapshotTextFromStore, ensureSavedBeforeOpen],
  );

  const handleOpenLocalBackup = useCallback(
    async (backupId: string) => {
      if (!ensureSavedBeforeOpen()) return;
      setStoragePanelBusy(true);
      try {
        const record = await getLocalBackup(backupId);
        if (!record?.json?.trim()) {
          window.alert("Backup wurde nicht gefunden oder ist leer.");
          return;
        }
        backupBeforeSuspiciousSwitch("import");
        if (!forceApplyBoardJson(record.json)) {
          window.alert("Backup konnte nicht geladen werden.");
          return;
        }
        setWorkingFileDirty(isWorkingFileAttached());
        setDataStoragePanelOpen(false);
        setPostImportSaveOpen(true);
      } finally {
        setStoragePanelBusy(false);
      }
    },
    [ensureSavedBeforeOpen],
  );

  const handleBackupIntervalChange = useCallback((minutes: BackupIntervalMinutes) => {
    setBackupIntervalMinutes(minutes);
    writeBackupIntervalMinutes(minutes);
  }, []);

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

  /** Neue Karte: Fokus + Titel sofort editierbar. */
  const beginEditingNewCard = useCallback((id: string) => {
    setSearchFocusNodeId(null);
    setKeyboardFocusNodeId(id);
    setTitleEditNodeId(id);
    setScrollToNodeId(id);
  }, []);

  const handleTitleSave = (
    nodeId: string,
    title: string,
    meta?: { addSiblingAfter?: boolean },
  ) => {
    updateCard(nodeId, { title: title.trim() });
    if (meta?.addSiblingAfter) {
      const newId = addCardAfterSibling(nodeId);
      if (newId) {
        beginEditingNewCard(newId);
        return;
      }
    }
    setTitleEditNodeId(null);
    setKeyboardFocusNodeId(nodeId);
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

  const applyPastedList = (cards: { title: string; description: string }[]) => {
    const parentId = pasteListParentId;
    if (parentId === null) return;
    const createdIds = importPastedCards(parentId, cards);
    if (createdIds.length === 0) {
      window.alert("Karten konnten nicht angelegt werden.");
      return;
    }
    setPasteListParentId(null);
    expandToNode(parentId);
    const lastId = createdIds[createdIds.length - 1];
    if (lastId) setScrollToNodeId(lastId);
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
            s.clipboardRoots,
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
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await readUserPickedFileText(file);
      applyImportedText(text);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Import fehlgeschlagen.");
    } finally {
      input.value = "";
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    setNestDropTargetId(null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const over = event.over;
    if (!over) {
      setNestDropTargetId(null);
      return;
    }
    const kind = over.data.current?.kind as string | undefined;
    if (kind === "contextNest") {
      const id = String(over.id);
      setNestDropTargetId(id === String(event.active.id) ? null : id);
      return;
    }
    if (kind === "outlineNest") {
      const nestId = parseOutlineNestId(over.id);
      const activeNodeId = boardNodeIdFromDragActive(event.active.id);
      setNestDropTargetId(nestId && nestId !== activeNodeId ? nestId : null);
      return;
    }
    setNestDropTargetId(null);
  };

  const endDragUi = () => {
    setActiveDragId(null);
    setNestDropTargetId(null);
  };

  const onDragCancel = () => {
    endDragUi();
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeRawId = String(active.id);
    const activeNodeId = boardNodeIdFromDragActive(activeRawId) ?? activeRawId;
    endDragUi();
    if (!over) return;

    const overId = String(over.id);
    const location = findNodeForestLocation(
      useTaskTreeStore.getState().roots,
      useTaskTreeStore.getState().clipboardRoots,
      activeNodeId,
    );

    if (
      location === "board" &&
      (overId === CLIPBOARD_DROP_TARGET_ID ||
        overId === CLIPBOARD_SIDEBAR_DROP_ID ||
        parseClipboardGapId(overId) ||
        findNodeById(useTaskTreeStore.getState().clipboardRoots, overId))
    ) {
      const clipRoots = useTaskTreeStore.getState().clipboardRoots;
      const forestTarget = forestDropTargetFromOverId(overId, clipRoots);
      if (forestTarget) {
        applyUnifiedDrag(activeNodeId, { type: "to-clipboard", target: forestTarget });
      } else {
        applyUnifiedDrag(activeNodeId, { type: "to-clipboard-end" });
      }
      setClipboardOpen(true);
      return;
    }

    if (location === "clipboard") {
      const clipRoots = useTaskTreeStore.getState().clipboardRoots;
      const forestTarget = forestDropTargetFromOverId(overId, clipRoots);
      if (forestTarget) {
        applyUnifiedDrag(activeNodeId, { type: "within-clipboard", target: forestTarget });
        return;
      }

      const outlineFromClip = outlineDropFromOverId(overId);
      if (outlineFromClip) {
        applyUnifiedDrag(activeNodeId, {
          type: "from-clipboard-to-outline",
          drop: outlineFromClip,
        });
        return;
      }

      const gapFromClip = parseContextGapId(overId);
      if (gapFromClip !== null) {
        applyUnifiedDrag(activeNodeId, {
          type: "from-clipboard-to-context",
          drop: { kind: "gap", insertIndex: gapFromClip },
        });
        return;
      }
      const nestFromClip = over.data.current?.kind as string | undefined;
      if (nestFromClip === "contextNest" && overId !== activeNodeId) {
        applyUnifiedDrag(activeNodeId, {
          type: "from-clipboard-to-context",
          drop: { kind: "nest", targetId: overId },
        });
      }
      return;
    }

    const outlineDrop = outlineDropFromOverId(overId);
    if (outlineDrop) {
      applyOutlineDrag(activeNodeId, outlineDrop);
      return;
    }

    const gap = parseContextGapId(overId);
    if (gap !== null) {
      applyContextListDrag(activeNodeId, { kind: "gap", insertIndex: gap });
      return;
    }
    const nestKind = over.data.current?.kind as string | undefined;
    if (nestKind === "contextNest" && overId !== activeNodeId) {
      applyContextListDrag(activeNodeId, { kind: "nest", targetId: overId });
    }
  };

  const collapsedSet = useMemo(() => new Set(collapsedIds), [collapsedIds]);

  const contextListNodes = useMemo(() => {
    const filtered = rootsForMindmapDisplay(roots, {
      hideCompletedTasks,
      completedTag,
      filterTags,
    });
    return contextChildren(filtered, contextNodeId);
  }, [roots, contextNodeId, hideCompletedTasks, completedTag, filterTags]);

  const breadcrumbPath = useMemo(
    () => contextPathNodes(roots, contextNodeId),
    [roots, contextNodeId],
  );

  const contextLabel = useMemo(() => {
    if (!contextNodeId) return "Wurzelkarten";
    const n = findNodeById(roots, contextNodeId);
    return n?.title.trim() || "(Ohne Titel)";
  }, [roots, contextNodeId]);

  const boardMaxVisibleLevels = useMemo(() => getBoardMaxVisibleLevels(roots), [roots]);

  const cardKeyboardBlocked =
    titleEditNodeId !== null ||
    editorOpen ||
    pendingDeleteId !== null ||
    activeDragId !== null ||
    levelSetupOpen ||
    cardFieldsOpen ||
    tagRenameOpen ||
    pendingBoardImport !== null ||
    pendingSubtreeImport !== null ||
    workingFileSetupOpen ||
    boardJsonExportOpen ||
    pasteImportOpen ||
    workingFilePasteOpen ||
    pasteSubtreeParentId !== null ||
    pasteListParentId !== null ||
    branchExportNode !== null ||
    appointmentsListOpen ||
    dataStoragePanelOpen ||
    postImportSaveOpen ||
    openWorkingFileConfirmOpen ||
    helpOpen ||
    clearClipboardConfirmOpen;

  useEffect(() => {
    if (cardKeyboardBlocked) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreCardKeyboard(e)) return;

      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
      const isArrow = arrowKeys.includes(e.key as (typeof arrowKeys)[number]);

      let currentId = keyboardFocusNodeId;
      if (isArrow && !currentId) {
        currentId = firstContextCardId(contextListNodes);
        if (!currentId) return;
      } else if (!currentId) {
        return;
      }

      if (isArrow) {
        e.preventDefault();
        const direction =
          e.key === "ArrowUp"
            ? "up"
            : e.key === "ArrowDown"
              ? "down"
              : e.key === "ArrowLeft"
                ? "left"
                : "right";
        const { nextId, shouldDrillIn, shouldDrillUp } = navigateContextCard(
          contextListNodes,
          currentId,
          direction,
        );
        if (shouldDrillUp) {
          const parentId = contextNodeId;
          drillUp();
          if (parentId) {
            setKeyboardFocusNodeId(parentId);
            setScrollToNodeId(parentId);
          }
          return;
        }
        if (shouldDrillIn && nextId) {
          drillIntoNode(nextId);
          const kids = contextChildren(useTaskTreeStore.getState().roots, nextId, {
            hideCompleted: hideCompletedTasks,
            completedTag,
          });
          const first = firstContextCardId(kids);
          setKeyboardFocusNodeId(first);
          setSearchFocusNodeId(null);
          if (first) setScrollToNodeId(first);
          return;
        }
        if (!nextId) return;
        setKeyboardFocusNodeId(nextId);
        setSearchFocusNodeId(null);
        setScrollToNodeId(nextId);
        return;
      }

      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        toggleNodeCollapsed(currentId);
        return;
      }

      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const id = addCardAfterSibling(currentId);
        if (!id) return;
        beginEditingNewCard(id);
        return;
      }

      if (e.key === "Tab" && !e.altKey) {
        e.preventDefault();
        const id = addCardAfter(currentId);
        expandToNode(id);
        beginEditingNewCard(id);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        setTitleEditNodeId(currentId);
        return;
      }

      if (e.key === "Escape" && contextNodeId) {
        e.preventDefault();
        const leaving = contextNodeId;
        drillUp();
        setKeyboardFocusNodeId(leaving);
        setScrollToNodeId(leaving);
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setPendingDeleteId(currentId);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void saveClipboardLinkToCard(currentId, updateCard);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cardKeyboardBlocked,
    keyboardFocusNodeId,
    contextListNodes,
    contextNodeId,
    drillUp,
    drillIntoNode,
    hideCompletedTasks,
    completedTag,
    toggleNodeCollapsed,
    addCardAfterSibling,
    addCardAfter,
    expandToNode,
    beginEditingNewCard,
    updateCard,
  ]);

  const boardJsonExportText = useMemo(() => {
    const s = useTaskTreeStore.getState();
    return stringifyExportedDocument(
      buildBoardSnapshot(
        s.roots,
        s.pathIds,
        s.columnTitleOverrides,
        s.cardFieldVisibility,
        s.hideCompletedTasks,
        s.effortOnTasksEnabled,
        s.filterTags,
        s.completedTag,
        s.collapsedIds,
        s.clipboardRoots,
      ),
    );
  }, [
    roots,
    clipboardRoots,
    columnTitleOverrides,
    cardFieldVisibility,
    hideCompletedTasks,
    effortOnTasksEnabled,
    filterTags,
    completedTag,
    collapsedIds,
    boardJsonExportOpen,
  ]);

  const workingFileAttached = isWorkingFileAttached();
  const workingFileLabel = workingFileName;

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

  /** Drill-in ohne Fokus-Override (z. B. wenn danach beginEditingNewCard folgt). */
  const drillIntoOnly = useCallback(
    (nodeId: string) => {
      drillIntoNode(nodeId);
      setSearchFocusNodeId(null);
    },
    [drillIntoNode],
  );

  const handleDrillIn = useCallback(
    (nodeId: string) => {
      drillIntoNode(nodeId);
      const kids = contextChildren(useTaskTreeStore.getState().roots, nodeId, {
        hideCompleted: hideCompletedTasks,
        completedTag,
      });
      const first = firstContextCardId(kids);
      setKeyboardFocusNodeId(first);
      setSearchFocusNodeId(null);
      if (first) setScrollToNodeId(first);
    },
    [drillIntoNode, hideCompletedTasks, completedTag],
  );

  const handleOutlineSelect = useCallback(
    (nodeId: string) => {
      expandToNode(nodeId);
      setKeyboardFocusNodeId(nodeId);
      setSearchFocusNodeId(nodeId);
      setScrollToNodeId(nodeId);
    },
    [expandToNode],
  );

  const appHeader = (
    <header className="shrink-0 border-b border-slate-200/80 bg-white px-6 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <h1 className="shrink-0 text-lg font-semibold text-slate-900">T2</h1>
          <TaskSearch onSelectNode={handleSearchSelect} />
          {boardMaxVisibleLevels > 1 ? (
            <DepthLevelsControl
              maxLevel={boardMaxVisibleLevels}
              onApplyLevel={(level) => applyBoardDepthInView(level)}
              onExpandAll={() => applyBoardDepthInView(null)}
            />
          ) : null}
          <ClipboardDropTarget
            count={clipboardRoots.length}
            open={clipboardOpen}
            onToggle={() => setClipboardOpen((v) => !v)}
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input
            ref={workingFilePickRef}
            type="file"
            accept=".json,application/json,text/json,application/octet-stream"
            className="hidden"
            aria-hidden
            onChange={(e) => void handleWorkingFilePickChange(e)}
          />
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
            onClick={() => setHelpOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
            title="Kurzanleitung und Tastaturkürzel"
            aria-label="Hilfe und Tastaturkürzel"
          >
            <CircleHelp className="h-3.5 w-3.5" aria-hidden />
          </button>
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
            onClick={() => setTagRenameOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
            title="Tags umbenennen"
            aria-label="Tags umbenennen"
          >
            <Tag className="h-3.5 w-3.5" aria-hidden />
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
  );

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <WorkingFileSync
        onWorkingFileNameChange={setWorkingFileName}
        onDirtyChange={onWorkingFileDirtyChange}
        onSavingChange={setWorkingFileSaving}
        onNeedsFileSetup={onNeedsWorkingFileSetup}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <DndContext
          id="task-board-dnd-aria"
          sensors={sensors}
          autoScroll
          collisionDetection={boardCollisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {appHeader}
            <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
              <OutlineRail
                roots={roots}
                collapsedIds={collapsedSet}
                contextNodeId={contextNodeId}
                hideCompletedTasks={hideCompletedTasks}
                completedTag={completedTag}
                nestDropTargetId={nestDropTargetId}
                onSelectNode={handleOutlineSelect}
                onToggleCollapsed={toggleNodeCollapsed}
              />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-slate-100 px-4 py-2">
                  <BreadcrumbTrail
                    path={breadcrumbPath}
                    onNavigateRoot={() => {
                      setContextNodeId(null);
                      setKeyboardFocusNodeId(firstContextCardId(contextChildren(roots, null)));
                    }}
                    onNavigateTo={(id) => {
                      setContextNodeId(id);
                      const kids = contextChildren(useTaskTreeStore.getState().roots, id);
                      setKeyboardFocusNodeId(firstContextCardId(kids));
                    }}
                    onDrillUp={() => {
                      const leaving = contextNodeId;
                      drillUp();
                      if (leaving) {
                        setKeyboardFocusNodeId(leaving);
                        setScrollToNodeId(leaving);
                      }
                    }}
                  />
                </div>
                <div
                  className={[
                    "min-h-0 flex-1 overflow-hidden px-4 py-3",
                    activeDragId ? "touch-none" : "",
                  ].join(" ")}
                >
                  <ContextCardList
                    nodes={contextListNodes}
                    contextLabel={contextLabel}
                    fieldVisibility={cardFieldVisibility}
                    searchFocusNodeId={searchFocusNodeId}
                    keyboardFocusNodeId={keyboardFocusNodeId}
                    titleEditNodeId={titleEditNodeId}
                    nestDropTargetId={nestDropTargetId}
                    onSelect={(id) => {
                      setKeyboardFocusNodeId(id);
                      setSearchFocusNodeId(null);
                    }}
                    onDrillIn={handleDrillIn}
                    onAddChild={(parentId) => {
                      const id = addCardAfter(parentId);
                      drillIntoOnly(parentId);
                      beginEditingNewCard(id);
                    }}
                    onAddSibling={() => {
                      const id = addCardAfter(contextNodeId);
                      beginEditingNewCard(id);
                    }}
                    onOpenDetails={handleOpenDetails}
                    onStartTitleEdit={(id) => setTitleEditNodeId(id)}
                    onTitleSave={handleTitleSave}
                    onTitleEditCancel={handleTitleEditCancel}
                    onRequestDelete={handleRequestDelete}
                  />
                </div>
              </div>
              <ClipboardSidebar
                open={clipboardOpen}
                roots={clipboardRoots}
                activeDragId={activeDragId}
                activeOverGap={clipboardOverGap}
                onRequestClear={() => setClearClipboardConfirmOpen(true)}
                onClose={() => setClipboardOpen(false)}
              />
            </div>
            <DragOverlay zIndex={40}>
              {activeDragId ? <DragPreviewCard id={activeDragId} /> : null}
            </DragOverlay>
          </div>
        </DndContext>
      </div>

      <JsonExportPreviewDialog
        open={boardJsonExportOpen}
        title="Backup als JSON (Kopieren)"
        hint="Identisch mit „Backup erstellen“ — ändert weder Server noch Arbeitsdatei. Text markieren oder kopieren."
        jsonText={boardJsonExportText}
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
        open={workingFilePasteOpen}
        title="Arbeitsdatei einfügen"
        hint="JSON-Inhalt Ihrer t2-board.json hier einfügen (z. B. vom PC kopiert). Nur Board-JSON (scope „board“)."
        onClose={() => setWorkingFilePasteOpen(false)}
        onApplyPastedText={(text) => void applyWorkingFilePastedText(text)}
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
      <PasteListDialog
        open={pasteListParentId !== null}
        title={
          pasteListParentId !== null
            ? `Liste einfügen unter „${findNodeById(roots, pasteListParentId)?.title?.trim() || "Karte"}“`
            : "Liste einfügen"
        }
        hint="Textzeilen einfügen — z. B. aus Notizen oder einer Aufzählung kopiert. Die Karten werden als Kinder der gewählten Karte angelegt."
        onClose={() => setPasteListParentId(null)}
        onApply={applyPastedList}
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
        open={clearClipboardConfirmOpen}
        title="Zwischenablage leeren?"
        message={
          clipboardRoots.length > 0
            ? `Alle ${clipboardRoots.length} Stammkarte${clipboardRoots.length === 1 ? "" : "n"} in der Zwischenablage werden unwiderruflich gelöscht — inklusive aller Unterkarten.\n\nKarten im Baum bleiben unverändert.`
            : ""
        }
        confirmLabel="Leeren"
        cancelLabel="Abbrechen"
        onCancel={() => setClearClipboardConfirmOpen(false)}
        onConfirm={() => {
          clearClipboard();
          setClearClipboardConfirmOpen(false);
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
          backupBeforeSuspiciousSwitch("import");
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
        mobileMode={prefersBrowserFilePicker()}
        fsAccessSupported={fsAccessSupportedForUi}
        unavailableMessage={fileSystemAccessUnavailableMessage()}
        onPickExistingMobile={() => beginAttachWorkingFile(false, { skipConfirm: true })}
        onPickFromDownloads={() => {
          setWorkingFileSetupOpen(false);
          workingFilePickRef.current?.click();
        }}
        onPasteJson={() => {
          setWorkingFileSetupOpen(false);
          setWorkingFilePasteOpen(true);
        }}
        lastUsedFileName={getRememberedWorkingFileName()}
        onOpenExistingDesktop={() => beginAttachWorkingFile(false, { skipConfirm: true })}
        onCreateNew={() => beginAttachWorkingFile(true)}
      />
      <BoardBackupSync
        intervalMinutes={backupIntervalMinutes}
        onLastBackupChange={setBackupLastLabel}
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
        mustSaveBeforeOpen={
          workingFileDirty || (!workingFileAttached && boardHasBackupContent())
        }
        backupIntervalMinutes={backupIntervalMinutes}
        backupLastLabel={backupLastLabel}
        onBackupIntervalChange={handleBackupIntervalChange}
        onBackupNow={() => runManualBoardBackup(setBackupLastLabel)}
        busy={storagePanelBusy}
        onOpenWorkingFile={() => beginAttachWorkingFile(false)}
        onCreateWorkingFile={() => beginAttachWorkingFile(true)}
        onChangeWorkingFile={handleChangeWorkingFile}
        onSaveWorkingFileAs={() => void handleSaveWorkingFileAs()}
        onOpenRecentWorkingFile={(handle) => void handleOpenRecentWorkingFile(handle)}
        onOpenLocalBackup={(id) => void handleOpenLocalBackup(id)}
        mobileWorkingFileMode={isMobileWorkingFileMode()}
        onExportWorkingFileForSync={handleExportWorkingFileForSync}
        onRestoreBackupFile={() => {
          if (!ensureSavedBeforeOpen()) return;
          setDataStoragePanelOpen(false);
          importFileRef.current?.click();
        }}
        onRestoreBackupPaste={() => {
          if (!ensureSavedBeforeOpen()) return;
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
        columnCount={Math.max(1, boardMaxVisibleLevels)}
        overrides={columnTitleOverrides}
        onClose={() => setLevelSetupOpen(false)}
        onApply={applyColumnTitleDraft}
      />
      <KeyboardShortcutsHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <TagRenameDialog open={tagRenameOpen} onClose={() => setTagRenameOpen(false)} />
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
          const nextFocus = id ? focusTargetAfterRemoving(roots, id) : null;
          setPendingDeleteId(null);
          if (!id) return;
          removeCard(id);
          if (editing === id) closeEditor();
          if (nextFocus) {
            setKeyboardFocusNodeId(nextFocus);
            setScrollToNodeId(nextFocus);
          } else {
            setKeyboardFocusNodeId(null);
          }
        }}
      />
    </div>
  );
}
