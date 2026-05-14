"use client";

import type { DragEndEvent, DragOverEvent, DragStartEvent, Over } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Copy, ClipboardPaste, Download, ListFilter, Route, Save, Settings2, SlidersHorizontal, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { resolveColumnDisplayTitle } from "@/lib/column-titles";
import type { BoardSnapshotV1 } from "@/lib/task-tree-json";
import {
  boardSnapshotToReplacePayload,
  buildBoardSnapshot,
  buildSubtreeSnapshot,
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
  disableLiveBackup,
  fileSystemAccessUnavailableMessage,
  fileSystemAccessUnavailableTooltip,
  flushLiveBackupJson,
  getLiveBackupHandle,
  isLiveBackupSupported,
  markPersistedBoardJson,
  pickLiveBackupTarget,
  STANDARD_BOARD_BACKUP_FILENAME,
} from "@/lib/live-backup";
import {
  boardColumnCount,
  buildMindmapDropPreview,
  findNodeById,
  filterColumnRowsHideCompleted,
  getColumnDisplayRows,
  getCurrentBranchNodeIds,
  listParentForColumn,
  parseColumnGapId,
  type TreeDragOverKind,
} from "@/lib/tree-utils";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { BoardDropPreview } from "@/types/dnd-preview";
import type { TaskNode } from "@/types/task-node";

import { TaskColumn } from "./task-column";
import { CardFieldVisibilityDialog } from "./card-field-visibility-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { ImportSubtreeDialog } from "./import-subtree-dialog";
import { JsonExportPreviewDialog, JsonPasteImportDialog } from "./json-clipboard-dialog";
import { LevelNamesSetupDialog } from "./level-names-setup-dialog";
import { LiveBackupSync } from "./live-backup-sync";
import { TaskEditorDialog } from "./task-editor-dialog";

function exportFilenameSlug(title: string): string {
  const s = title
    .trim()
    .replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "export";
}

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

function DragPreviewCard({ id }: { id: string }) {
  const roots = useTaskTreeStore((s) => s.roots);
  const node = findNodeById(roots, id);
  if (!node) return null;
  return (
    <div className="pointer-events-none w-72 max-w-[85vw] rounded-lg border border-slate-200 bg-white p-3 shadow-2xl ring-2 ring-sky-200/90">
      <p className="text-sm font-semibold text-slate-900">{node.title.trim() || "(Ohne Titel)"}</p>
      <p className="mt-1 text-[11px] text-slate-500">Zweig wird verschoben …</p>
    </div>
  );
}

export function TaskBoard() {
  const roots = useTaskTreeStore((s) => s.roots);
  const pathIds = useTaskTreeStore((s) => s.pathIds);
  const expandToNode = useTaskTreeStore((s) => s.expandToNode);
  const applyTreeDrag = useTaskTreeStore((s) => s.applyTreeDrag);
  const addCardAfter = useTaskTreeStore((s) => s.addCardAfter);
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
  const setHideCompletedTasks = useTaskTreeStore((s) => s.setHideCompletedTasks);

  const branchNodeIds = useMemo(() => getCurrentBranchNodeIds(roots, pathIds), [roots, pathIds]);

  const [dropPreview, setDropPreview] = useState<BoardDropPreview | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [levelSetupOpen, setLevelSetupOpen] = useState(false);
  const [cardFieldsOpen, setCardFieldsOpen] = useState(false);
  const [pendingBoardImport, setPendingBoardImport] = useState<BoardSnapshotV1 | null>(null);
  const [pendingSubtreeImport, setPendingSubtreeImport] = useState<TaskNode | null>(null);
  const [liveBackupFileName, setLiveBackupFileName] = useState<string | null>(null);
  const [persistDirty, setPersistDirty] = useState(false);
  /** Server + erste Client-Zeichnung false — gleiches Markup wie SSR, vermeidet Hydration-Mismatch zu `showSaveFilePicker`. */
  const [fsAccessSupportedForUi, setFsAccessSupportedForUi] = useState(false);
  /** Nach useEffect: dynamische Tooltips (UA/Brave) erst clientseitig. */
  const [persistUiReady, setPersistUiReady] = useState(false);
  const [boardJsonExportOpen, setBoardJsonExportOpen] = useState(false);
  const [pasteImportOpen, setPasteImportOpen] = useState(false);
  const [subtreeJsonExportNode, setSubtreeJsonExportNode] = useState<TaskNode | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const onPersistDirtyChange = useCallback((dirty: boolean) => {
    setPersistDirty(dirty);
  }, []);

  useEffect(() => {
    setFsAccessSupportedForUi(isLiveBackupSupported());
    setPersistUiReady(true);
  }, []);

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
      ),
    );
  }, []);

  const openEditor = (id: string) => {
    setEditorNodeId(id);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorNodeId(null);
  };

  const handleAddInColumn = (columnIndex: number) => {
    openEditor(addCardAfter(listParentForColumn(pathIds, columnIndex)));
  };

  const handleEditCard = (nodeId: string) => {
    openEditor(nodeId);
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
    );
    downloadJsonFile(STANDARD_BOARD_BACKUP_FILENAME, stringifyExportedDocument(doc));
  };

  const handleExportMindmapMm = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`task-board-${stamp}.mm`, taskRootsToFreemindMm(roots), "application/xml");
  };

  const handleExportSubtree = (node: TaskNode) => {
    const doc = buildSubtreeSnapshot(node, { sourceNodeTitle: node.title });
    downloadJsonFile(`teilbaum-${exportFilenameSlug(node.title)}.json`, stringifyExportedDocument(doc));
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

  const handlePersistBoardToFile = async () => {
    if (!isLiveBackupSupported()) {
      window.alert(fileSystemAccessUnavailableMessage());
      return;
    }
    try {
      if (!getLiveBackupHandle()) {
        const h = await pickLiveBackupTarget();
        if (!h) return;
        setLiveBackupFileName(h.name?.trim() ? h.name : "Speicherdatei");
      }
      const json = boardSnapshotTextFromStore();
      const ok = await flushLiveBackupJson(json);
      if (!ok) {
        window.alert("Speichern fehlgeschlagen (Berechtigung oder kein gültiges Speicherziel).");
        await disableLiveBackup();
        setLiveBackupFileName(null);
        setPersistDirty(false);
        return;
      }
      markPersistedBoardJson(json);
      setPersistDirty(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      window.alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    }
  };

  const handleStopLiveBackup = async () => {
    await disableLiveBackup();
    setLiveBackupFileName(null);
    setPersistDirty(false);
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
    setDropPreview(null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setDropPreview(null);
      return;
    }
    const activeId = String(active.id);
    const { roots: r, pathIds: p } = useTaskTreeStore.getState();
    const preview = buildPreview(r, p, activeId, over);
    setDropPreview(preview && preview.activeId === activeId ? preview : null);
  };

  const endDragUi = () => {
    setDropPreview(null);
    setActiveDragId(null);
  };

  const onDragCancel = () => {
    endDragUi();
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const overKind = over ? overToDragKind(over, useTaskTreeStore.getState().pathIds) : null;
    const activeId = String(active.id);
    endDragUi();
    if (!over || !overKind) return;

    applyTreeDrag(activeId, overKind);
  };

  const columnCount = useMemo(() => boardColumnCount(roots, pathIds), [roots, pathIds]);

  const boardExportJsonText = boardJsonExportOpen
    ? stringifyExportedDocument(
        buildBoardSnapshot(
          roots,
          pathIds,
          columnTitleOverrides,
          cardFieldVisibility,
          hideCompletedTasks,
          effortOnTasksEnabled,
        ),
      )
    : "";

  const subtreeExportJsonText = subtreeJsonExportNode
    ? stringifyExportedDocument(
        buildSubtreeSnapshot(subtreeJsonExportNode, { sourceNodeTitle: subtreeJsonExportNode.title }),
      )
    : "";

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  const persistTarget = getLiveBackupHandle();
  const persistConnected = Boolean(persistTarget);
  const persistLabel =
    liveBackupFileName?.trim() ||
    (persistTarget?.name != null && persistTarget.name.trim() !== "" ? persistTarget.name : null);

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <LiveBackupSync onActiveFileNameChange={setLiveBackupFileName} onPersistDirtyChange={onPersistDirtyChange} />
      <header className="shrink-0 border-b border-slate-200/80 bg-white/90 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-slate-900">Hierarchischer Task-Manager</h1>
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
              onClick={handleExportFullBoard}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
              title="Gesamten Stand als JSON-Datei speichern"
              aria-label="Gesamten Stand als JSON-Datei exportieren"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={handleExportMindmapMm}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
              title="Gesamten Stand als FreeMind-Mindmap (.mm)"
              aria-label="Gesamten Stand als Mindmap exportieren"
            >
              <Route className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setBoardJsonExportOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
              title="Gesamten Stand als JSON anzeigen und kopieren"
              aria-label="Gesamten Stand als JSON anzeigen und kopieren"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void handlePersistBoardToFile()}
              className={[
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition",
                !fsAccessSupportedForUi
                  ? "border-amber-200/90 bg-amber-50/80 text-amber-900 hover:bg-amber-100/90"
                  : persistDirty && persistConnected
                    ? "border-red-200/90 bg-red-50 text-red-700 ring-2 ring-red-300/70 hover:bg-red-100/90"
                    : persistConnected
                      ? "border-emerald-200/90 bg-emerald-50/90 text-emerald-900 ring-1 ring-emerald-200/80 hover:bg-emerald-100/80"
                      : "border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900",
              ].join(" ")}
              title={
                !fsAccessSupportedForUi
                  ? !persistUiReady
                    ? "Stand in eine Datei sichern (Browser-Unterstützung wird gleich geprüft)."
                    : fileSystemAccessUnavailableTooltip()
                  : !persistConnected
                    ? "Stand sichern: Datei wählen oder anlegen — danach schreibt derselbe Knopf immer in diese Datei"
                    : persistDirty
                      ? persistLabel
                        ? `Ungesicherte Änderungen — jetzt in „${persistLabel}“ schreiben`
                        : "Ungesicherte Änderungen — jetzt in die konfigurierte Datei schreiben"
                      : persistLabel
                        ? `In „${persistLabel}“ speichern (bereits synchron, wenn nichts geändert wurde)`
                        : "In die konfigurierte Datei speichern"
              }
              aria-label={
                persistConnected
                  ? persistLabel
                    ? `Stand in ${persistLabel} sichern`
                    : "Stand in konfigurierter Datei sichern"
                  : "Stand sichern und Speicherdatei wählen"
              }
            >
              <Save className="h-3.5 w-3.5" aria-hidden />
            </button>
            {persistConnected ? (
              <button
                type="button"
                onClick={() => void handleStopLiveBackup()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-500 transition hover:bg-white hover:text-red-700"
                title="Speicherdatei trennen (zum Wechseln der Datei: trennen, dann erneut speichern)"
                aria-label="Speicherdatei trennen"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => importFileRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
              title="JSON oder Mindmap (.mm) aus Datei importieren"
              aria-label="JSON oder Mindmap aus Datei importieren"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setPasteImportOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900"
              title="JSON oder Mindmap (.mm) aus Textfeld importieren"
              aria-label="JSON oder Mindmap aus Textfeld importieren"
            >
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
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
            <button
              type="button"
              onClick={() => setHideCompletedTasks(!hideCompletedTasks)}
              className={[
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition",
                hideCompletedTasks
                  ? "border-sky-300/90 bg-sky-50 text-sky-800 ring-1 ring-sky-200/80 hover:bg-sky-100/80"
                  : "border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900",
              ].join(" ")}
              title={
                hideCompletedTasks
                  ? "Erledigte Karten wieder in der Ansicht anzeigen"
                  : "Erledigte Karten in der Spaltenansicht ausblenden (nur Anzeige; beim Export wird die Option mitgespeichert, wenn aktiv)"
              }
              aria-label="Filter: erledigte Aufgaben"
              aria-pressed={hideCompletedTasks}
            >
              <ListFilter className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <DndContext
        id="task-board-dnd-aria"
        sensors={sensors}
        autoScroll={false}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 py-4">
            {Array.from({ length: columnCount }, (_, columnIndex) => {
              const rawRows = getColumnDisplayRows(roots, pathIds, columnIndex);
              if (columnIndex > 0 && rawRows.length === 0) return null;
              const rows = hideCompletedTasks ? filterColumnRowsHideCompleted(rawRows) : rawRows;
              return (
                <TaskColumn
                  key={columnIndex}
                  title={resolveColumnDisplayTitle(columnTitleOverrides, columnIndex)}
                  columnIndex={columnIndex}
                  rows={rows}
                  pathIds={pathIds}
                  branchNodeIds={branchNodeIds}
                  onAddCard={handleAddInColumn}
                  roots={roots}
                  onAddChildCard={(parentId) => {
                    const id = addCardAfter(parentId);
                    expandToNode(parentId);
                    openEditor(id);
                  }}
                  onEditCard={handleEditCard}
                  onDeleteCard={handleRequestDelete}
                  onActivateBranch={expandToNode}
                  dropPreview={dropPreview}
                  fieldVisibility={cardFieldVisibility}
                  onExportSubtree={handleExportSubtree}
                  onCopySubtreeJson={(node) => setSubtreeJsonExportNode(node)}
                />
              );
            })}
          </div>
        </div>

        <DragOverlay>{activeDragId ? <DragPreviewCard id={activeDragId} /> : null}</DragOverlay>
      </DndContext>

      <JsonExportPreviewDialog
        open={boardJsonExportOpen}
        title="Gesamter Stand als JSON"
        hint="Identisch mit dem Dateiexport (format, roots, pathIds, Einstellungen). Text markieren oder über die Schaltfläche kopieren."
        jsonText={boardExportJsonText}
        onClose={() => setBoardJsonExportOpen(false)}
      />
      <JsonExportPreviewDialog
        open={subtreeJsonExportNode !== null}
        title="Teilbaum als JSON"
        hint={
          subtreeJsonExportNode
            ? `Wurzelknoten: „${subtreeJsonExportNode.title}“ — gleiches Format wie „Teilbaum als Datei exportieren“.`
            : undefined
        }
        jsonText={subtreeExportJsonText}
        onClose={() => setSubtreeJsonExportNode(null)}
      />
      <JsonPasteImportDialog
        open={pasteImportOpen}
        title="JSON oder Mindmap einfügen"
        hint="Board-JSON (scope „board“), Teilbaum-JSON (scope „subtree“) oder FreeMind-/Freeplane-XML (.mm), beginnend mit „<“. Bei einem vollständigen Board-Import folgt die Bestätigung zum Ersetzen."
        onClose={() => setPasteImportOpen(false)}
        onApplyPastedText={applyImportedText}
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
        open={pendingBoardImport !== null}
        title="Gesamten Stand ersetzen?"
        message={
          pendingBoardImport
            ? `Alle Karten, Drill-Pfad, Ebenen-Namen und Einstellungen werden ersetzt (${pendingBoardImport.roots.length} Wurzelkarten) — aus Datei oder Textfeld. Der Vorgang kann nicht rückgängig gemacht werden.`
            : ""
        }
        confirmLabel="Ersetzen"
        cancelLabel="Abbrechen"
        confirmClassName="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        onCancel={() => setPendingBoardImport(null)}
        onConfirm={() => {
          const snap = pendingBoardImport;
          setPendingBoardImport(null);
          if (!snap) return;
          replaceBoardFromImport(boardSnapshotToReplacePayload(snap));
          closeEditor();
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
        onClose={() => setCardFieldsOpen(false)}
        onApply={(next, effortOn) => {
          applyCardFieldVisibility(next);
          setEffortOnTasksEnabled(effortOn);
        }}
      />
      <TaskEditorDialog
        open={editorOpen}
        nodeId={editorNodeId}
        onClose={closeEditor}
        onSave={(id, fields) => {
          updateCard(id, fields);
        }}
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
