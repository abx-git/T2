"use client";

import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { FileStack, HardDrive, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { useStore } from "zustand";

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
import { boardCollisionDetection } from "@/lib/board-dnd-collision";
import {
  BOARD_PANE_IDS,
  type BoardPaneId,
  type PaneContexts,
} from "@/lib/board-pane";
import { applyBoardJsonToStore, applyBoardPayloadToStore, boardJsonFromStoreState } from "@/lib/file-board-reconcile";
import {
  getMobileLayoutServerSnapshot,
  getMobileLayoutSnapshot,
  subscribeMobileLayout,
} from "@/lib/mobile-layout";
import {
  getTemplatesSnapshot,
  hydrateTemplatesFromIdb,
  subscribeTemplates,
  templateRootAsTaskNode,
} from "@/lib/templates";
import type { BoardSnapshotV1 } from "@/lib/task-tree-json";
import {
  boardSnapshotToReplacePayload,
  buildBoardSnapshot,
  downloadExportSchema,
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
  resolveSiblingInsertAfterId,
  rootsForMindmapDisplay,
} from "@/lib/tree-utils";
import { getBoardMaxVisibleLevels } from "@/lib/tree-depth-collapse";
import {
  firstContextCardId,
  focusTargetAfterRemoving,
  navigateContextCard,
  navigateExpandedCard,
  shouldIgnoreCardKeyboard,
} from "@/lib/card-keyboard-nav";
import { flattenVisibleCards } from "@/lib/card-expand";
import {
  contextChildren,
  contextPathNodes,
} from "@/lib/board-context";
import {
  parseContextGapId,
  parseContextNestDropId,
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
import { isNoteNode, nodeDisplayTitle } from "@/lib/tree-node-kind";
import {
  dataStorageButtonClassName,
  deriveStorageDisplayStatus,
  formatStorageStatusTooltip,
  hasUnsavedWorkingFile,
} from "@/lib/storage-coordinator";
import { redoBoard, undoBoard, useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskNode } from "@/types/task-node";

import { BoardHeaderMoreMenu } from "./board-header-more-menu";
import { TagFilterBar } from "./tag-filter-bar";
import { BetaBadge } from "./beta-badge";
import { BoardPane } from "./board-pane";
import { ClipboardDropTarget } from "./clipboard-drop-target";
import { ClipboardSidebar } from "./clipboard-sidebar";
import { TaskSearch } from "./task-search";
import { OutlineRail } from "./outline-rail";
import { CardFieldVisibilityDialog } from "./card-field-visibility-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { ImportSubtreeDialog } from "./import-subtree-dialog";
import { FilterResultsDialog } from "./filter-results-dialog";
import { BranchExportDialog, JsonExportPreviewDialog, JsonPasteImportDialog } from "./json-clipboard-dialog";
import { PasteListDialog } from "./paste-list-dialog";
import { TemplateInsertDialog } from "./template-insert-dialog";
import { TemplateSaveDialog } from "./template-save-dialog";
import { TemplatesSidebar } from "./templates-sidebar";
import { TagRenameDialog } from "./tag-rename-dialog";
import { WorkingFileSync } from "./working-file-sync";
import { WorkingFileSetupDialog } from "./working-file-setup-dialog";
import { DataStoragePanel } from "./data-storage-panel";
import { PostImportSaveDialog } from "./post-import-save-dialog";
import { TaskEditorDialog } from "./task-editor-dialog";
import { NoteEditorDialog } from "./note-editor-dialog";
import { KeyboardShortcutsHelpDialog } from "./keyboard-shortcuts-help-dialog";


function DragPreviewCard({ id }: { id: string }) {
  const roots = useTaskTreeStore((s) => s.roots);
  const clipboardRoots = useTaskTreeStore((s) => s.clipboardRoots);
  const nodeId = boardNodeIdFromDragActive(id) ?? id;
  const node = findNodeById(roots, nodeId) ?? findNodeById(clipboardRoots, nodeId);
  if (!node) return null;
  const label = nodeDisplayTitle(node);
  return (
    <div className="pointer-events-none w-72 max-w-[85vw] rounded-lg border border-slate-200 bg-white p-3 shadow-2xl ring-2 ring-sky-200/90">
      <p className="text-sm font-semibold text-slate-900">
        {isNoteNode(node) ? "Notiz: " : ""}
        {label}
      </p>
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
  const cardCollapsedIds = useTaskTreeStore((s) => s.cardCollapsedIds);
  const toggleCardCollapsed = useTaskTreeStore((s) => s.toggleCardCollapsed);
  const applyCardDepthInView = useTaskTreeStore((s) => s.applyCardDepthInView);
  const cardInteractionMode = useTaskTreeStore((s) => s.cardInteractionMode);
  const setCardInteractionMode = useTaskTreeStore((s) => s.setCardInteractionMode);
  const expandToNode = useTaskTreeStore((s) => s.expandToNode);
  const contextNodeId = useTaskTreeStore((s) => s.contextNodeId);
  const contextByPane = useTaskTreeStore((s) => s.contextByPane);
  const activePane = useTaskTreeStore((s) => s.activePane);
  const setActivePane = useTaskTreeStore((s) => s.setActivePane);
  const splitViewEnabled = useTaskTreeStore((s) => s.splitViewEnabled);
  const setSplitViewEnabled = useTaskTreeStore((s) => s.setSplitViewEnabled);
  const isMobileLayout = useSyncExternalStore(
    subscribeMobileLayout,
    getMobileLayoutSnapshot,
    getMobileLayoutServerSnapshot,
  );
  /** Split View nur Desktop; Einstellung bleibt im Store erhalten. */
  const showSplitView = splitViewEnabled && !isMobileLayout;
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
  const addNoteAfter = useTaskTreeStore((s) => s.addNoteAfter);
  const addNoteAfterSibling = useTaskTreeStore((s) => s.addNoteAfterSibling);
  const updateCard = useTaskTreeStore((s) => s.updateCard);
  const updateNote = useTaskTreeStore((s) => s.updateNote);
  const removeCard = useTaskTreeStore((s) => s.removeCard);
  const columnTitleOverrides = useTaskTreeStore((s) => s.columnTitleOverrides);
  const importSubtreeRoot = useTaskTreeStore((s) => s.importSubtreeRoot);
  const applyTemplateUnder = useTaskTreeStore((s) => s.applyTemplateUnder);
  const importPastedCards = useTaskTreeStore((s) => s.importPastedCards);
  const cardFieldVisibility = useTaskTreeStore((s) => s.cardFieldVisibility);
  const applyCardFieldVisibility = useTaskTreeStore((s) => s.applyCardFieldVisibility);
  const effortOnTasksEnabled = useTaskTreeStore((s) => s.effortOnTasksEnabled);
  const noteAccentColor = useTaskTreeStore((s) => s.noteAccentColor);
  const setNoteAccentColor = useTaskTreeStore((s) => s.setNoteAccentColor);
  const setEffortOnTasksEnabled = useTaskTreeStore((s) => s.setEffortOnTasksEnabled);
  const hideCompletedTasks = useTaskTreeStore((s) => s.hideCompletedTasks);
  const filterTags = useTaskTreeStore((s) => s.filterTags);
  const filterColors = useTaskTreeStore((s) => s.filterColors);
  const filterScheduleKinds = useTaskTreeStore((s) => s.filterScheduleKinds);
  const filterCombineMode = useTaskTreeStore((s) => s.filterCombineMode);
  const completedTag = useTaskTreeStore((s) => s.completedTag);
  const setCompletedTag = useTaskTreeStore((s) => s.setCompletedTag);
  const canUndo = useStore(useTaskTreeStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useTaskTreeStore.temporal, (s) => s.futureStates.length > 0);

  const [searchFocusNodeId, setSearchFocusNodeId] = useState<string | null>(null);
  const [keyboardFocusByPane, setKeyboardFocusByPane] = useState<PaneContexts>({
    left: null,
    right: null,
  });
  const keyboardFocusNodeId = keyboardFocusByPane[activePane];
  const setKeyboardFocusNodeId = useCallback(
    (nodeId: string | null, pane: BoardPaneId = activePane) => {
      setKeyboardFocusByPane((prev) =>
        prev[pane] === nodeId ? prev : { ...prev, [pane]: nodeId },
      );
    },
    [activePane],
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [nestDropTargetId, setNestDropTargetId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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
  const [templateSaveRoot, setTemplateSaveRoot] = useState<TaskNode | null>(null);
  const [templateInsertParentId, setTemplateInsertParentId] = useState<string | null>(null);
  const [templateInsertPrefillId, setTemplateInsertPrefillId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [filterResultsOpen, setFilterResultsOpen] = useState(false);
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
  const templateCount = useSyncExternalStore(subscribeTemplates, getTemplatesSnapshot, () => []).length;
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
    void hydrateTemplatesFromIdb();
  }, []);

  useEffect(() => {
    if (!scrollToNodeId) return;
    const reveal = () => {
      const target = document.querySelector(
        `[data-board-pane="${activePane}"][data-task-card-id="${CSS.escape(scrollToNodeId)}"]`,
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
  }, [scrollToNodeId, activePane]);

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

  const beginEditingNewNote = useCallback((id: string) => {
    setSearchFocusNodeId(null);
    setKeyboardFocusNodeId(id);
    setScrollToNodeId(id);
    setEditorNodeId(id);
    setEditorOpen(true);
  }, [setKeyboardFocusNodeId]);

  /** Neue Karte: Fokus + Titel sofort editierbar. */
  const beginEditingNewCard = useCallback((id: string) => {
    setSearchFocusNodeId(null);
    setKeyboardFocusNodeId(id);
    setTitleEditNodeId(id);
    setScrollToNodeId(id);
  }, [setKeyboardFocusNodeId]);

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
            getTemplatesSnapshot(),
            s.filterColors,
            s.filterScheduleKinds,
            s.cardCollapsedIds,
            s.cardInteractionMode,
            s.filterCombineMode,
            s.noteAccentColor,
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
      const nestId =
        (over.data.current?.nodeId as string | undefined) ?? parseContextNestDropId(over.id);
      const activeNodeId = boardNodeIdFromDragActive(event.active.id);
      setNestDropTargetId(nestId && nestId !== activeNodeId ? nestId : null);
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
          drop: { kind: "gap", ...gapFromClip },
        });
        return;
      }
      const nestFromClip = over.data.current?.kind as string | undefined;
      if (nestFromClip === "contextNest") {
        const nestTarget =
          (over.data.current?.nodeId as string | undefined) ?? parseContextNestDropId(overId);
        if (nestTarget && nestTarget !== activeNodeId) {
          applyUnifiedDrag(activeNodeId, {
            type: "from-clipboard-to-context",
            drop: { kind: "nest", targetId: nestTarget },
          });
        }
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
      applyContextListDrag(activeNodeId, { kind: "gap", ...gap });
      return;
    }
    const nestKind = over.data.current?.kind as string | undefined;
    if (nestKind === "contextNest") {
      const nestTarget =
        (over.data.current?.nodeId as string | undefined) ?? parseContextNestDropId(overId);
      if (nestTarget && nestTarget !== activeNodeId) {
        applyContextListDrag(activeNodeId, { kind: "nest", targetId: nestTarget });
      }
    }
  };

  const collapsedSet = useMemo(() => new Set(collapsedIds), [collapsedIds]);
  const cardCollapsedSet = useMemo(() => new Set(cardCollapsedIds), [cardCollapsedIds]);

  const filteredRoots = useMemo(
    () =>
      rootsForMindmapDisplay(roots, {
        hideCompletedTasks,
        completedTag,
        filterTags,
        filterColors,
        filterScheduleKinds,
        filterCombineMode,
      }),
    [
      roots,
      hideCompletedTasks,
      completedTag,
      filterTags,
      filterColors,
      filterScheduleKinds,
      filterCombineMode,
    ],
  );

  const contextListNodesByPane = useMemo(() => {
    const result = {} as Record<BoardPaneId, TaskNode[]>;
    for (const pane of BOARD_PANE_IDS) {
      result[pane] = contextChildren(filteredRoots, contextByPane[pane]);
    }
    return result;
  }, [filteredRoots, contextByPane]);

  const contextListNodes = contextListNodesByPane[activePane];

  const visibleExpandCardsByPane = useMemo(() => {
    const result = {} as Record<BoardPaneId, ReturnType<typeof flattenVisibleCards>>;
    for (const pane of BOARD_PANE_IDS) {
      result[pane] =
        cardInteractionMode === "expand"
          ? flattenVisibleCards(contextListNodesByPane[pane], cardCollapsedSet, {
              hideCompleted: hideCompletedTasks,
              completedTag,
            })
          : [];
    }
    return result;
  }, [
    cardInteractionMode,
    contextListNodesByPane,
    cardCollapsedSet,
    hideCompletedTasks,
    completedTag,
  ]);

  const visibleExpandCards = visibleExpandCardsByPane[activePane];

  const breadcrumbPathByPane = useMemo(() => {
    const result = {} as Record<BoardPaneId, TaskNode[]>;
    for (const pane of BOARD_PANE_IDS) {
      result[pane] = contextPathNodes(roots, contextByPane[pane]);
    }
    return result;
  }, [roots, contextByPane]);

  const contextLabelByPane = useMemo(() => {
    const result = {} as Record<BoardPaneId, string>;
    for (const pane of BOARD_PANE_IDS) {
      const ctx = contextByPane[pane];
      if (!ctx) {
        result[pane] = "Wurzelkarten";
        continue;
      }
      const n = findNodeById(roots, ctx);
      result[pane] = n ? nodeDisplayTitle(n) : "(Ohne Titel)";
    }
    return result;
  }, [roots, contextByPane]);

  const editingNode = editorNodeId ? findNodeById(roots, editorNodeId) : null;
  const editingIsNote = editingNode ? isNoteNode(editingNode) : false;

  const boardMaxVisibleLevels = useMemo(() => getBoardMaxVisibleLevels(roots), [roots]);

  const cardKeyboardBlocked =
    titleEditNodeId !== null ||
    editorOpen ||
    pendingDeleteId !== null ||
    activeDragId !== null ||
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
    templateSaveRoot !== null ||
    templateInsertParentId !== null ||
    filterResultsOpen ||
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
        currentId =
          cardInteractionMode === "expand"
            ? (visibleExpandCards[0]?.node.id ?? null)
            : firstContextCardId(contextListNodes);
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

        const nav =
          cardInteractionMode === "expand"
            ? navigateExpandedCard(visibleExpandCards, cardCollapsedSet, currentId, direction)
            : navigateContextCard(contextListNodes, currentId, direction);

        const { nextId, shouldDrillIn, shouldDrillUp, shouldExpand, shouldCollapse } = nav;

        if (shouldExpand && nextId) {
          if (cardCollapsedSet.has(nextId)) toggleCardCollapsed(nextId);
          return;
        }
        if (shouldCollapse && nextId) {
          if (!cardCollapsedSet.has(nextId)) toggleCardCollapsed(nextId);
          return;
        }
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
        toggleCardCollapsed(currentId);
        return;
      }

      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (e.shiftKey) {
          const id = addNoteAfterSibling(currentId);
          if (!id) return;
          beginEditingNewNote(id);
          return;
        }
        const id = addCardAfterSibling(currentId);
        if (!id) return;
        beginEditingNewCard(id);
        return;
      }

      if (e.key === "Tab" && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          const id = addNoteAfter(currentId);
          expandToNode(id);
          beginEditingNewNote(id);
          return;
        }
        const id = addCardAfter(currentId);
        expandToNode(id);
        beginEditingNewCard(id);
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        setTitleEditNodeId(null);
        setEditorNodeId(currentId);
        setEditorOpen(true);
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
        const node = findNodeById(roots, currentId);
        if (node && !isNoteNode(node)) {
          void saveClipboardLinkToCard(currentId, updateCard);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cardKeyboardBlocked,
    keyboardFocusNodeId,
    contextListNodes,
    visibleExpandCards,
    cardCollapsedSet,
    cardInteractionMode,
    contextNodeId,
    drillUp,
    drillIntoNode,
    hideCompletedTasks,
    completedTag,
    toggleCardCollapsed,
    addCardAfterSibling,
    addCardAfter,
    addNoteAfterSibling,
    addNoteAfter,
    expandToNode,
    beginEditingNewCard,
    beginEditingNewNote,
    updateCard,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreCardKeyboard(e)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        undoBoard();
        return;
      }
      if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redoBoard();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (keyboardFocusNodeId && !findNodeById(roots, keyboardFocusNodeId)) {
      setKeyboardFocusNodeId(null);
    }
    if (searchFocusNodeId && !findNodeById(roots, searchFocusNodeId)) {
      setSearchFocusNodeId(null);
    }
    if (titleEditNodeId && !findNodeById(roots, titleEditNodeId)) {
      setTitleEditNodeId(null);
    }
    if (editorNodeId && !findNodeById(roots, editorNodeId)) {
      setEditorOpen(false);
      setEditorNodeId(null);
    }
  }, [roots, keyboardFocusNodeId, searchFocusNodeId, titleEditNodeId, editorNodeId]);

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
        getTemplatesSnapshot(),
        s.filterColors,
        s.filterScheduleKinds,
        s.cardCollapsedIds,
        s.cardInteractionMode,
        s.filterCombineMode,
        s.noteAccentColor,
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
    filterColors,
    filterScheduleKinds,
    filterCombineMode,
    completedTag,
    collapsedIds,
    cardCollapsedIds,
    cardInteractionMode,
    noteAccentColor,
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
    (nodeId: string, pane: BoardPaneId = activePane) => {
      drillIntoNode(nodeId, pane);
      setSearchFocusNodeId(null);
    },
    [drillIntoNode, activePane],
  );

  const handleDrillIn = useCallback(
    (nodeId: string, pane: BoardPaneId = activePane) => {
      if (pane !== activePane) setActivePane(pane);
      drillIntoNode(nodeId, pane);
      const kids = contextChildren(useTaskTreeStore.getState().roots, nodeId, {
        hideCompleted: hideCompletedTasks,
        completedTag,
      });
      const first = firstContextCardId(kids);
      setKeyboardFocusNodeId(first, pane);
      setSearchFocusNodeId(null);
      if (first) setScrollToNodeId(first);
    },
    [drillIntoNode, hideCompletedTasks, completedTag, activePane, setActivePane, setKeyboardFocusNodeId],
  );

  const handleOutlineSelect = useCallback(
    (nodeId: string) => {
      handleDrillIn(nodeId, activePane);
    },
    [handleDrillIn, activePane],
  );

  const renderPane = (paneId: BoardPaneId) => {
    const ctx = contextByPane[paneId];
    const nodes = contextListNodesByPane[paneId];
    const isActive = activePane === paneId;
    return (
      <BoardPane
        key={paneId}
        paneId={paneId}
        active={isActive}
        dragging={Boolean(activeDragId)}
        contextNodeId={ctx}
        breadcrumbPath={breadcrumbPathByPane[paneId]}
        contextLabel={contextLabelByPane[paneId]}
        nodes={nodes}
        fieldVisibility={cardFieldVisibility}
        searchFocusNodeId={isActive ? searchFocusNodeId : null}
        keyboardFocusNodeId={keyboardFocusByPane[paneId]}
        // Nur aktive Pane: sonst zwei Titel-Inputs bei gleichem Kontext (Fokus-Race → Edit endet sofort).
        titleEditNodeId={isActive ? titleEditNodeId : null}
        nestDropTargetId={nestDropTargetId}
        interactionMode={cardInteractionMode}
        cardCollapsedIds={cardCollapsedSet}
        hideCompleted={hideCompletedTasks}
        completedTag={completedTag}
        onActivate={() => setActivePane(paneId)}
        onNavigateRoot={() => {
          setActivePane(paneId);
          setContextNodeId(null, paneId);
          setKeyboardFocusNodeId(firstContextCardId(contextChildren(roots, null)), paneId);
        }}
        onNavigateTo={(id) => {
          setActivePane(paneId);
          setContextNodeId(id, paneId);
          const kids = contextChildren(useTaskTreeStore.getState().roots, id);
          setKeyboardFocusNodeId(firstContextCardId(kids), paneId);
        }}
        onDrillUp={() => {
          setActivePane(paneId);
          const leaving = contextByPane[paneId];
          drillUp(paneId);
          if (leaving) {
            setKeyboardFocusNodeId(leaving, paneId);
            setScrollToNodeId(leaving);
          }
        }}
        onSelect={(id) => {
          setActivePane(paneId);
          setKeyboardFocusNodeId(id, paneId);
          setSearchFocusNodeId(null);
        }}
        onDrillIn={(id) => handleDrillIn(id, paneId)}
        onToggleExpand={toggleCardCollapsed}
        onInteractionModeChange={setCardInteractionMode}
        onAddChild={(parentId) => {
          setActivePane(paneId);
          const id = addCardAfter(parentId);
          if (cardInteractionMode === "navigate") {
            drillIntoOnly(parentId, paneId);
          } else if (cardCollapsedSet.has(parentId)) {
            toggleCardCollapsed(parentId);
          }
          beginEditingNewCard(id);
        }}
        onAddSibling={() => {
          setActivePane(paneId);
          const focusId = keyboardFocusByPane[paneId];
          const afterId = focusId ? resolveSiblingInsertAfterId(roots, focusId) : null;
          const id = afterId
            ? (addCardAfterSibling(afterId) ?? addCardAfter(ctx))
            : addCardAfter(ctx);
          beginEditingNewCard(id);
        }}
        onAddNote={() => {
          setActivePane(paneId);
          const focusId = keyboardFocusByPane[paneId];
          const afterId = focusId ? resolveSiblingInsertAfterId(roots, focusId) : null;
          const id = afterId
            ? (addNoteAfterSibling(afterId) ?? addNoteAfter(ctx))
            : addNoteAfter(ctx);
          beginEditingNewNote(id);
        }}
        onOpenDetails={handleOpenDetails}
        onTitleSave={handleTitleSave}
        onTitleEditCancel={handleTitleEditCancel}
        onRequestExport={(nodeId) => {
          const n = findNodeById(roots, nodeId);
          if (n) setBranchExportNode(n);
        }}
        onRequestInsertTemplate={(nodeId) => setTemplateInsertParentId(nodeId)}
        onRequestDelete={handleRequestDelete}
      />
    );
  };

  const appHeader = (
    <header className="shrink-0 border-b border-slate-200/80 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-1.5">
          <h1 className="text-sm font-semibold tracking-tight text-slate-900">T2</h1>
          <BetaBadge />
        </div>

        <div className="min-w-0 flex-1">
          <TaskSearch onSelectNode={handleSearchSelect} />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => undoBoard()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
            title="Rückgängig"
            aria-label="Rückgängig"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={() => redoBoard()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
            title="Wiederholen"
            aria-label="Wiederholen"
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden />
          </button>

          <span className="mx-0.5 hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />

          <ClipboardDropTarget
            count={clipboardRoots.length}
            open={clipboardOpen}
            onToggle={() => {
              setClipboardOpen((v) => !v);
              setTemplatesOpen(false);
            }}
          />
          <button
            type="button"
            onClick={() => {
              setTemplatesOpen((v) => !v);
              setClipboardOpen(false);
            }}
            className={[
              "flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition",
              templatesOpen
                ? "bg-sky-50 text-sky-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            ].join(" ")}
            title="Vorlagen"
            aria-label={`Vorlagen${templateCount ? `, ${templateCount}` : ""}${templatesOpen ? ", geöffnet" : ""}`}
            aria-pressed={templatesOpen}
          >
            <FileStack className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Vorlagen</span>
            {templateCount > 0 ? (
              <span className="min-w-[1.15rem] rounded-full bg-sky-600 px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
                {templateCount}
              </span>
            ) : null}
          </button>

          <span className="mx-0.5 hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />

          <button
            type="button"
            onClick={() => setDataStoragePanelOpen(true)}
            className={dataStorageButtonClassName(storageDisplayStatus.tone)}
            title={dataStorageTooltip}
            aria-label={`Daten und Speicher: ${storageDisplayStatus.primaryLine}`}
          >
            <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden max-w-[7.5rem] truncate text-xs font-medium sm:inline">
              {storageDisplayStatus.tone === "no-file" || storageDisplayStatus.tone === "unsupported"
                ? "Datei"
                : "Daten"}
            </span>
          </button>

          <BoardHeaderMoreMenu
            boardMaxVisibleLevels={boardMaxVisibleLevels}
            splitAvailable={!isMobileLayout}
            splitViewEnabled={splitViewEnabled}
            onSplitViewChange={setSplitViewEnabled}
            onApplyBoardDepth={(level) => applyBoardDepthInView(level)}
            onExpandBoardDepth={() => applyBoardDepthInView(null)}
            onApplyCardDepth={(level) => applyCardDepthInView(level)}
            onExpandCardDepth={() => applyCardDepthInView(null)}
            onOpenTagRename={() => setTagRenameOpen(true)}
            onOpenCardFields={() => setCardFieldsOpen(true)}
            onOpenHelp={() => setHelpOpen(true)}
          />
        </div>
      </div>

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

      <TagFilterBar onOpenResults={() => setFilterResultsOpen(true)} />
    </header>
  );

  return (
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden">
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
              <div className="flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
                {showSplitView ? (
                  <>
                    {renderPane("left")}
                    <div
                      className="w-px shrink-0 bg-slate-200"
                      aria-hidden
                    />
                    {renderPane("right")}
                  </>
                ) : (
                  renderPane(activePane)
                )}
              </div>
              <ClipboardSidebar
                open={clipboardOpen}
                roots={clipboardRoots}
                activeDragId={activeDragId}
                activeOverGap={clipboardOverGap}
                onRequestClear={() => setClearClipboardConfirmOpen(true)}
                onClose={() => setClipboardOpen(false)}
                onSaveAsTemplate={(node) => setTemplateSaveRoot(node)}
              />
              <TemplatesSidebar
                open={templatesOpen}
                onClose={() => setTemplatesOpen(false)}
                onInsertRequest={(tpl) => {
                  const parentId = keyboardFocusNodeId ?? contextListNodes[0]?.id ?? null;
                  if (!parentId) {
                    window.alert(
                      "Bitte zuerst eine Zielkarte wählen (oder eine Karte anlegen), unter die die Vorlage eingefügt werden soll.",
                    );
                    return;
                  }
                  setTemplateInsertPrefillId(tpl.id);
                  setTemplateInsertParentId(parentId);
                }}
              />
            </div>
            <DragOverlay zIndex={40}>
              {activeDragId ? <DragPreviewCard id={activeDragId} /> : null}
            </DragOverlay>
          </div>
        </DndContext>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200/80 bg-white px-4 py-1.5 text-[0.72rem] text-slate-500">
        <span className="min-w-0 truncate">
          {workingFileName
            ? `Arbeitsdatei: ${workingFileName}${workingFileDirty ? " · ungespeichert" : workingFileSaving ? " · speichert …" : " · gespeichert"}`
            : workingFileAttached
              ? "Arbeitsdatei verknüpft"
              : "Keine Arbeitsdatei"}
        </span>
        <span className="hidden shrink-0 sm:inline">T2 · © A. Bergmann</span>
        <span className="shrink-0 sm:hidden">© A. Bergmann</span>
      </footer>

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
        onSaveAsTemplate={(root) => {
          setTemplateSaveRoot(root);
        }}
      />
      <TemplateSaveDialog
        open={templateSaveRoot !== null}
        root={templateSaveRoot}
        defaultName={templateSaveRoot?.title}
        onClose={() => setTemplateSaveRoot(null)}
        onSaved={() => {
          setTemplatesOpen(true);
          setClipboardOpen(false);
        }}
      />
      <TemplateInsertDialog
        open={templateInsertParentId !== null}
        parentTitle={
          templateInsertParentId
            ? findNodeById(roots, templateInsertParentId)?.title
            : undefined
        }
        initialTemplateId={templateInsertPrefillId}
        onClose={() => {
          setTemplateInsertParentId(null);
          setTemplateInsertPrefillId(null);
        }}
        onInsert={(template, mode) => {
          if (!templateInsertParentId) return;
          const n = applyTemplateUnder(
            templateInsertParentId,
            templateRootAsTaskNode(template),
            mode,
          );
          if (n > 0) {
            /* feedback via title is enough; optional toast skipped */
          }
        }}
      />
      <FilterResultsDialog
        open={filterResultsOpen}
        onClose={() => setFilterResultsOpen(false)}
        onSelectNode={(nodeId) => {
          expandToNode(nodeId);
          setSearchFocusNodeId(nodeId);
          setKeyboardFocusNodeId(nodeId);
          setScrollToNodeId(nodeId);
          handleOpenDetails(nodeId);
        }}
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
            ? `Alle Karten, Drill-Pfad und Einstellungen werden ersetzt (${pendingBoardImport.roots.length} Wurzelkarten). Die Arbeitsdatei wird nicht automatisch angepasst — danach können Sie speichern. Nicht rückgängig machbar.`
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
          applyBoardPayloadToStore(boardSnapshotToReplacePayload(snap));
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
        onExportSchema={() => {
          downloadExportSchema();
        }}
      />
      <KeyboardShortcutsHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <TagRenameDialog open={tagRenameOpen} onClose={() => setTagRenameOpen(false)} />
      <CardFieldVisibilityDialog
        open={cardFieldsOpen}
        value={cardFieldVisibility}
        effortOnTasksEnabled={effortOnTasksEnabled}
        completedTag={completedTag}
        noteAccentColor={noteAccentColor}
        onClose={() => setCardFieldsOpen(false)}
        onApply={(next, effortOn, doneTag, noteAccent) => {
          applyCardFieldVisibility(next);
          setEffortOnTasksEnabled(effortOn);
          setCompletedTag(doneTag);
          setNoteAccentColor(noteAccent);
        }}
      />
      <TaskEditorDialog
        open={editorOpen && !editingIsNote}
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
      <NoteEditorDialog
        open={editorOpen && editingIsNote}
        nodeId={editorNodeId}
        onClose={closeEditor}
        onSave={(id, fields) => {
          updateNote(id, fields);
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
        title="Eintrag löschen?"
        message={
          pendingDeleteId
            ? `„${findNodeById(roots, pendingDeleteId) ? nodeDisplayTitle(findNodeById(roots, pendingDeleteId)!) : "Dieser Eintrag"}“ und alle Untereinträge endgültig löschen?`
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
