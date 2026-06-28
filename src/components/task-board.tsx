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

import { parseBoardVaultLoxIdFromInput } from "@/lib/lox-id";
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
import type { VaultStatusInfo } from "@/lib/server-board";
import {
  getLocalBoardBackupEntry,
  listLocalBoardBackups,
  type LocalBoardBackupListItem,
} from "@/lib/board-local-backup";
import { flushLocalBoardMirror, readLocalBoardMirror } from "@/lib/board-local-mirror";
import {
  deriveStorageDisplayStatus,
  formatStorageRelativeTime,
  formatStorageStatusTooltip,
  hasUnsavedPrimaryTarget,
  resolveAutoSaveTarget,
  storageModeFromFlags,
} from "@/lib/storage-coordinator";
import {
  clearOfflinePauseState,
  hasOfflinePauseState,
  hasOfflinePendingChanges,
  pauseServerBoardOffline,
} from "@/lib/server-board-offline";
import { readStorageMode, writeStorageMode } from "@/lib/storage-session";
import { readVaultLoxId, writeVaultLoxId } from "@/lib/lox-vault-session";
import {
  detachServerBoard,
  fetchVaultStatus,
  getLastKnownEtag,
  getLastSyncedBoardJson,
  isServerBoardDirty,
  setLinkedVaultLoxId,
  setPendingVaultLinkIntent,
  type VaultLinkIntent,
  writeBoardToServer,
} from "@/lib/server-board";
import { useTaskTreeStore } from "@/store/task-tree-store";
import { dropIntentLabel, type BoardDropPreview } from "@/types/dnd-preview";
import type { TaskNode } from "@/types/task-node";

import { BoardLocalPersist } from "./board-local-persist";
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
import { ServerBoardNetworkSync } from "./server-board-network-sync";
import { ServerBoardOfflineSync } from "./server-board-offline-sync";
import { ServerBoardSync, saveServerBoardToVault } from "./server-board-sync";
import { LoxVaultDialog, type LoxVaultDialogMode } from "./lox-vault-dialog";
import { WorkingFileSync } from "./working-file-sync";
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
  const [vaultStatus, setVaultStatus] = useState<VaultStatusInfo | null>(null);
  const [vaultLoxId, setVaultLoxId] = useState<string | null>(null);
  const [serverBoardEnabled, setServerBoardEnabled] = useState(false);
  const [serverBoardDirty, setServerBoardDirty] = useState(false);
  const [serverBoardSaving, setServerBoardSaving] = useState(false);
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [vaultDialogMode, setVaultDialogMode] = useState<LoxVaultDialogMode>("connect");
  const [serverOfflinePending, setServerOfflinePending] = useState(false);
  const [serverBoardAutoPaused, setServerBoardAutoPaused] = useState(false);
  const [serverSaveError, setServerSaveError] = useState<string | null>(null);
  const [titleEditNodeId, setTitleEditNodeId] = useState<string | null>(null);
  const [boardJsonExportOpen, setBoardJsonExportOpen] = useState(false);
  const [pasteImportOpen, setPasteImportOpen] = useState(false);
  const [pasteSubtreeParentId, setPasteSubtreeParentId] = useState<string | null>(null);
  const [branchExportNode, setBranchExportNode] = useState<TaskNode | null>(null);
  const [appointmentsListOpen, setAppointmentsListOpen] = useState(false);
  const [scrollToNodeId, setScrollToNodeId] = useState<string | null>(null);
  const [dataStoragePanelOpen, setDataStoragePanelOpen] = useState(false);
  const [storagePanelBusy, setStoragePanelBusy] = useState(false);
  const [localMirrorSavedAt, setLocalMirrorSavedAt] = useState<string | null>(null);
  const [localBackupEntries, setLocalBackupEntries] = useState<LocalBoardBackupListItem[]>([]);
  const [pendingLocalBackupSavedAt, setPendingLocalBackupSavedAt] = useState<string | null>(null);
  const [postImportSaveOpen, setPostImportSaveOpen] = useState(false);
  const [openWorkingFileConfirmOpen, setOpenWorkingFileConfirmOpen] = useState(false);
  const boardColumnsRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const dropPreviewRef = useRef<BoardDropPreview | null>(null);

  const onWorkingFileDirtyChange = useCallback((dirty: boolean) => {
    setWorkingFileDirty(dirty);
  }, []);

  useEffect(() => {
    setFsAccessSupportedForUi(isWorkingFileSupported());
    setWorkingFileUiReady(true);
  }, []);

  useEffect(() => {
    const refreshLocalCopies = () => {
      setLocalMirrorSavedAt(readLocalBoardMirror()?.savedAt ?? null);
      setLocalBackupEntries(listLocalBoardBackups());
    };
    refreshLocalCopies();
    const timer = setInterval(refreshLocalCopies, 2000);
    const unsub = useTaskTreeStore.subscribe(() => {
      refreshLocalCopies();
    });
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const status = await fetchVaultStatus();
      setVaultStatus(status);
      const storedLoxId = readVaultLoxId();
      if (storedLoxId) {
        detachServerBoard();
        setVaultLoxId(storedLoxId);
        setLinkedVaultLoxId(storedLoxId);
      }
      const mode = readStorageMode();
      if (
        mode === "server" &&
        status.configured &&
        storedLoxId &&
        !hasOfflinePauseState()
      ) {
        setServerBoardEnabled(true);
      }
    })();
  }, []);

  const onServerBoardDirtyChange = useCallback((dirty: boolean) => {
    setServerBoardDirty(dirty);
  }, []);

  const onServerBoardConnectFailed = useCallback(() => {
    setServerBoardEnabled(false);
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

  const boardSnapshotTextFromStore = useCallback(() => {
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
      ),
    );
  }, []);

  const enterServerBoardOfflineMode = useCallback(
    (options?: { auto?: boolean }) => {
      if (!serverBoardEnabled) return;
      const json = boardSnapshotTextFromStore();
      pauseServerBoardOffline({
        baselineJson: getLastSyncedBoardJson() ?? json,
        baselineEtag: getLastKnownEtag(),
        currentJson: json,
        autoPaused: options?.auto ?? false,
      });
      detachServerBoard();
      setServerBoardEnabled(false);
      setServerBoardDirty(false);
      setServerOfflinePending(hasOfflinePendingChanges(json));
      setServerBoardAutoPaused(options?.auto ?? false);
      flushLocalBoardMirror(json);
    },
    [boardSnapshotTextFromStore, serverBoardEnabled],
  );

  const reconnectServerBoard = useCallback(() => {
    if (!vaultLoxId) return;
    setServerBoardAutoPaused(false);
    setServerBoardEnabled(true);
  }, [vaultLoxId]);

  const detachWorkingFileWithSave = useCallback(async (): Promise<boolean> => {
    if (!isWorkingFileAttached()) return true;
    const json = boardSnapshotTextFromStore();
    if (isWorkingFileDirty(json)) {
      const ok = await writeWorkingFileJson(json);
      if (!ok) {
        window.alert(
          "Trennen nicht möglich: letzter Schreibvorgang in die Arbeitsdatei ist fehlgeschlagen.",
        );
        return false;
      }
    }
    await detachWorkingFile();
    setWorkingFileName(null);
    setWorkingFileDirty(false);
    writeStorageMode("browser");
    return true;
  }, [boardSnapshotTextFromStore]);

  const disconnectServerBoardLink = useCallback(
    async (options?: { saveFirst?: boolean; offline?: boolean }) => {
      if (!serverBoardEnabled) return true;
      const json = boardSnapshotTextFromStore();
      if (options?.saveFirst !== false && isServerBoardDirty(json)) {
        try {
          await writeBoardToServer(json, getLastKnownEtag());
        } catch {
          if (options?.offline) {
            const cont = window.confirm(
              "Speichern auf den Server ist fehlgeschlagen.\n\nTrotzdem trennen? Ihre Änderungen bleiben als Offline-Entwurf auf diesem Gerät erhalten.",
            );
            if (!cont) return false;
          } else {
            window.alert("Trennen nicht möglich: letzter Schreibvorgang auf den Server ist fehlgeschlagen.");
            return false;
          }
        }
      }
      if (options?.offline !== false) {
        enterServerBoardOfflineMode({ auto: false });
      } else {
        detachServerBoard();
        setServerBoardEnabled(false);
        setServerBoardDirty(false);
        writeStorageMode("browser");
      }
      return true;
    },
    [boardSnapshotTextFromStore, enterServerBoardOfflineMode, serverBoardEnabled],
  );

  const beginVaultLink = useCallback(
    async (loxId: string, intent: VaultLinkIntent = "connect") => {
      if (!vaultStatus?.configured) {
        window.alert(
          "LOX-Vault ist nicht verfügbar. Auf dem Host T2_VAULT_ENABLED setzen oder NEXT_PUBLIC_T2_VAULT_API_URL konfigurieren.",
        );
        return false;
      }
      const canonical = parseBoardVaultLoxIdFromInput(loxId);
      if (!canonical) {
        window.alert(
          "Ungültige Board-LOX-ID — Format BRD-XXXX-XXXX.\nDie gekürzte Anzeige in „Daten“ reicht nicht zum Verbinden.",
        );
        return false;
      }
      const detached = await detachWorkingFileWithSave();
      if (!detached) return false;
      detachServerBoard();
      setServerSaveError(null);
      writeVaultLoxId(canonical);
      setVaultLoxId(canonical);
      setLinkedVaultLoxId(canonical);
      setPendingVaultLinkIntent(intent);
      setServerBoardAutoPaused(false);
      setServerBoardEnabled(true);
      writeStorageMode("server");
      return true;
    },
    [detachWorkingFileWithSave, vaultStatus?.configured],
  );

  const connectServerBoardLink = useCallback(async () => {
    if (!vaultStatus?.configured) {
      window.alert(
        "LOX-Vault ist nicht verfügbar. Auf dem Host T2_VAULT_ENABLED setzen oder NEXT_PUBLIC_T2_VAULT_API_URL konfigurieren.",
      );
      return false;
    }
    if (vaultLoxId) {
      return beginVaultLink(vaultLoxId);
    }
    setVaultDialogMode("connect");
    setVaultDialogOpen(true);
    return false;
  }, [beginVaultLink, vaultLoxId, vaultStatus?.configured]);

  const attachWorkingFileLink = useCallback(
    async (createNew: boolean) => {
      if (!isWorkingFileSupported()) {
        window.alert(fileSystemAccessUnavailableMessage());
        return false;
      }
      if (serverBoardEnabled) {
        const ok = await disconnectServerBoardLink({ offline: true });
        if (!ok) return false;
      }
      try {
        const json = boardSnapshotTextFromStore();
        const handle = createNew
          ? await createAndAttachWorkingFile(json)
          : await attachWorkingFileFromPicker();
        if (!handle) return false;
        setWorkingFileName(handle.name?.trim() ? handle.name : "Arbeitsdatei");
        if (createNew) setWorkingFileDirty(false);
        writeStorageMode("file");
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return false;
        window.alert(err instanceof Error ? err.message : "Arbeitsdatei konnte nicht verknüpft werden.");
        return false;
      }
    },
    [boardSnapshotTextFromStore, disconnectServerBoardLink, serverBoardEnabled],
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

  const handleSelectAutoSaveTarget = useCallback(
    async (target: "local" | "working-file" | "server") => {
      if (target === "working-file") {
        if (isWorkingFileAttached()) return;
        beginAttachWorkingFile(false);
        return;
      }

      setStoragePanelBusy(true);
      try {
        if (target === "local") {
          if (serverBoardEnabled) {
            const ok = await disconnectServerBoardLink({ saveFirst: true, offline: false });
            if (!ok) return;
          }
          if (serverOfflinePending || hasOfflinePauseState()) {
            const cont = window.confirm(
              "Offline-Entwurf für den Server verwerfen und nur im Browser weiterarbeiten?",
            );
            if (!cont) return;
            clearOfflinePauseState();
            setServerOfflinePending(false);
            setServerBoardAutoPaused(false);
          }
          if (isWorkingFileAttached()) {
            const ok = await detachWorkingFileWithSave();
            if (!ok) return;
          }
          writeStorageMode("browser");
          return;
        }
        if (target === "server") {
          if (serverBoardEnabled) return;
          await connectServerBoardLink();
        }
      } finally {
        setStoragePanelBusy(false);
      }
    },
    [
      beginAttachWorkingFile,
      connectServerBoardLink,
      detachWorkingFileWithSave,
      disconnectServerBoardLink,
      serverBoardEnabled,
      serverOfflinePending,
    ],
  );

  const handlePostImportSaveToFile = useCallback(async () => {
    setPostImportSaveOpen(false);
    if (!isWorkingFileAttached()) {
      beginAttachWorkingFile(false);
      return;
    }
    const json = boardSnapshotTextFromStore();
    const written = await writeWorkingFileJson(json);
    if (!written) window.alert("Speichern in die Arbeitsdatei ist fehlgeschlagen.");
    else {
      setWorkingFileDirty(false);
      writeStorageMode("file");
    }
  }, [beginAttachWorkingFile, boardSnapshotTextFromStore]);

  const handleSaveServerBoard = useCallback(async () => {
    setStoragePanelBusy(true);
    setServerSaveError(null);
    try {
      const result = await saveServerBoardToVault();
      if (!result.ok) {
        setServerSaveError(result.error);
        if (!result.offline) {
          window.alert(result.error);
        }
      } else {
        setServerBoardDirty(false);
      }
    } finally {
      setStoragePanelBusy(false);
    }
  }, []);

  const handlePostImportSyncServer = useCallback(async () => {
    setPostImportSaveOpen(false);
    if (!vaultStatus?.configured) {
      setVaultDialogMode("connect");
      setVaultDialogOpen(true);
      return;
    }
    if (!vaultLoxId) {
      setVaultDialogMode("connect");
      setVaultDialogOpen(true);
      return;
    }
    await detachWorkingFileWithSave();
    await beginVaultLink(vaultLoxId);
    const json = boardSnapshotTextFromStore();
    try {
      await writeBoardToServer(json, getLastKnownEtag());
      setServerBoardDirty(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Speichern auf den Server ist fehlgeschlagen.");
    }
  }, [beginVaultLink, boardSnapshotTextFromStore, detachWorkingFileWithSave, vaultLoxId, vaultStatus?.configured]);

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

  const handleVaultCreate = useCallback(
    (loxId: string) => {
      setVaultDialogOpen(false);
      void beginVaultLink(loxId, "create");
    },
    [beginVaultLink],
  );

  const handleVaultConnect = useCallback(
    (loxId: string) => {
      setVaultDialogOpen(false);
      void beginVaultLink(loxId, "connect");
    },
    [beginVaultLink],
  );

  const openCreateVaultDialog = useCallback(() => {
    setVaultDialogMode("create");
    setVaultDialogOpen(true);
  }, []);

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

  const storageMode = storageModeFromFlags({
    serverBoardEnabled,
    workingFileAttached,
    serverOfflinePending,
  });

  const autoSaveTarget = resolveAutoSaveTarget({
    serverBoardEnabled,
    workingFileAttached,
    serverOfflinePending,
  });

  const storageDisplayStatus = useMemo(
    () =>
      deriveStorageDisplayStatus({
        storageMode,
        workingFileLabel,
        workingFileDirty,
        workingFileSaving,
        serverBoardDirty,
        serverBoardSaving,
        serverOfflinePending,
        serverBoardAutoPaused,
        localMirrorSavedAt,
      }),
    [
      storageMode,
      workingFileLabel,
      workingFileDirty,
      workingFileSaving,
      serverBoardDirty,
      serverBoardSaving,
      serverOfflinePending,
      serverBoardAutoPaused,
      localMirrorSavedAt,
    ],
  );

  useEffect(() => {
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      const dirty = hasUnsavedPrimaryTarget({
        storageMode,
        workingFileDirty,
        serverBoardDirty,
      });
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnOnLeave);
    return () => window.removeEventListener("beforeunload", warnOnLeave);
  }, [storageMode, workingFileDirty, serverBoardDirty]);

  const dataStorageTooltip = useMemo(
    () => formatStorageStatusTooltip(storageDisplayStatus),
    [storageDisplayStatus],
  );

  const localMirrorHint = formatStorageRelativeTime(localMirrorSavedAt);

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <BoardLocalPersist />
      <WorkingFileSync
        onWorkingFileNameChange={setWorkingFileName}
        onDirtyChange={onWorkingFileDirtyChange}
        onSavingChange={setWorkingFileSaving}
      />
      <ServerBoardOfflineSync
        serverBoardEnabled={serverBoardEnabled}
        onOfflinePendingChange={setServerOfflinePending}
      />
      <ServerBoardNetworkSync
        serverBoardEnabled={serverBoardEnabled}
        vaultLinked={Boolean(vaultLoxId)}
        onAutoOffline={() => enterServerBoardOfflineMode({ auto: true })}
        onAutoReconnect={reconnectServerBoard}
        onAutoPausedChange={setServerBoardAutoPaused}
      />
      <ServerBoardSync
        enabled={serverBoardEnabled}
        onDirtyChange={onServerBoardDirtyChange}
        onSavingChange={setServerBoardSaving}
        onConnectFailed={onServerBoardConnectFailed}
        onNetworkUnavailable={() => enterServerBoardOfflineMode({ auto: true })}
        onSaveError={setServerSaveError}
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
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50/80 px-2.5 text-slate-600 transition hover:bg-white hover:text-slate-900"
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
          serverBoardEnabled
            ? "Die gewählte JSON-Datei ersetzt die aktuelle Board-Ansicht in T2.\n\nDer Server wird getrennt. Offene Änderungen werden zuvor auf den Server geschrieben (sofern möglich); der letzte Stand auf dem Server bleibt erhalten.\n\nUm stattdessen den aktuellen Stand in eine neue Datei zu schreiben, wählen Sie „Neue Datei“."
            : "Die gewählte JSON-Datei ersetzt die aktuelle Board-Ansicht in T2. Der Inhalt der Datei wird geladen — nicht der zuletzt sichtbare Stand, sofern er abweicht.\n\nUm den aktuellen Stand in eine neue Datei zu schreiben, wählen Sie „Neue Datei“."
        }
        confirmLabel="Datei öffnen"
        cancelLabel="Abbrechen"
        confirmClassName="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        onCancel={() => setOpenWorkingFileConfirmOpen(false)}
        onConfirm={handleConfirmOpenWorkingFile}
      />
      <ConfirmDialog
        open={pendingLocalBackupSavedAt !== null}
        title="Notfall-Sicherung wiederherstellen?"
        message={
          pendingLocalBackupSavedAt
            ? `Board-Stand vom ${new Date(pendingLocalBackupSavedAt).toLocaleString()} laden? Alle aktuellen Karten werden ersetzt. Server und Arbeitsdatei werden nicht automatisch angepasst.`
            : ""
        }
        confirmLabel="Wiederherstellen"
        cancelLabel="Abbrechen"
        confirmClassName="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        onCancel={() => setPendingLocalBackupSavedAt(null)}
        onConfirm={() => {
          const savedAt = pendingLocalBackupSavedAt;
          setPendingLocalBackupSavedAt(null);
          if (!savedAt) return;
          const entry = getLocalBoardBackupEntry(savedAt);
          if (!entry) {
            window.alert("Diese Sicherung ist nicht mehr verfügbar.");
            setLocalBackupEntries(listLocalBoardBackups());
            return;
          }
          try {
            const doc = parseExportedDocument(entry.json);
            if (!isBoardSnapshot(doc)) {
              window.alert("Ungültige Sicherung — kein Board-Export.");
              return;
            }
            replaceBoardFromImport(boardSnapshotToReplacePayload(doc));
            closeEditor();
            setPostImportSaveOpen(true);
          } catch (err) {
            window.alert(err instanceof Error ? err.message : "Wiederherstellen fehlgeschlagen.");
          }
        }}
      />
      <ConfirmDialog
        open={pendingBoardImport !== null}
        title="Backup einspielen?"
        message={
          pendingBoardImport
            ? `Alle Karten, Drill-Pfad, Ebenen-Namen und Einstellungen werden ersetzt (${pendingBoardImport.roots.length} Wurzelkarten). Weder Server noch Arbeitsdatei werden automatisch angepasst — danach können Sie ein Speicherziel wählen. Nicht rückgängig machbar.`
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
        workingFileAvailable={fsAccessSupportedForUi}
        serverConfigured={Boolean(vaultStatus?.configured)}
        onSaveToWorkingFile={() => void handlePostImportSaveToFile()}
        onSyncToServer={() => void handlePostImportSyncServer()}
        onKeepLocalOnly={() => {
          setPostImportSaveOpen(false);
          writeStorageMode("browser");
        }}
      />
      <DataStoragePanel
        open={dataStoragePanelOpen}
        onClose={() => setDataStoragePanelOpen(false)}
        autoSaveTarget={autoSaveTarget}
        fsAccessSupported={fsAccessSupportedForUi}
        workingFileUiReady={workingFileUiReady}
        workingFileUnavailableTooltip={fileSystemAccessUnavailableTooltip()}
        workingFileLabel={workingFileLabel}
        workingFileDirty={workingFileDirty}
        workingFileSaving={workingFileSaving}
        vaultStatus={vaultStatus}
        vaultLoxId={vaultLoxId}
        serverBoardEnabled={serverBoardEnabled}
        serverBoardDirty={serverBoardDirty}
        serverBoardSaving={serverBoardSaving}
        serverOfflinePending={serverOfflinePending}
        serverBoardAutoPaused={serverBoardAutoPaused}
        localMirrorHint={localMirrorHint}
        localBackupEntries={localBackupEntries}
        onRestoreLocalBackup={(savedAt) => {
          setPendingLocalBackupSavedAt(savedAt);
        }}
        busy={storagePanelBusy}
        onSelectTarget={(target) => void handleSelectAutoSaveTarget(target)}
        onAttachWorkingFile={(createNew) => beginAttachWorkingFile(createNew)}
        onDetachWorkingFile={() => {
          setStoragePanelBusy(true);
          void detachWorkingFileWithSave().finally(() => setStoragePanelBusy(false));
        }}
        onCreateVault={openCreateVaultDialog}
        onConnectVault={() => {
          setStoragePanelBusy(true);
          void connectServerBoardLink().finally(() => setStoragePanelBusy(false));
        }}
        onDisconnectServer={() => {
          setStoragePanelBusy(true);
          void disconnectServerBoardLink({ offline: true }).finally(() => setStoragePanelBusy(false));
        }}
        onSaveServer={() => void handleSaveServerBoard()}
        serverSaveError={serverSaveError}
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
      <LoxVaultDialog
        open={vaultDialogOpen}
        mode={vaultDialogMode}
        onClose={() => setVaultDialogOpen(false)}
        onCreate={handleVaultCreate}
        onConnect={handleVaultConnect}
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
