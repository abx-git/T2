/**
 * Geräteweite Vorlagen-Bibliothek (Teilbäume) — IndexedDB + In-Memory-Cache.
 * Portabilität: werden in BoardSnapshotV1.templates mitgeschrieben.
 */

import {
  taskNodeFromJson,
  taskNodeToJson,
  type TaskNodeJson,
  type TemplateRecordV1,
} from "@/lib/task-tree-json";
import type { TaskNode } from "@/types/task-node";

export type TemplateRecord = TemplateRecordV1;

export type TemplateInsertMode = "children" | "wrapper";

const IDB_NAME = "t2-templates";
const IDB_VERSION = 1;
const IDB_STORE = "templates";
const IDB_LIST_KEY = "library";

type Listener = () => void;

let cache: TemplateRecord[] = [];
let hydrated = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

/** React-Subscription für die Bibliothek. */
export function subscribeTemplates(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTemplatesSnapshot(): TemplateRecord[] {
  return cache;
}

function setCache(next: TemplateRecord[]): void {
  cache = next;
  notify();
}

function openTemplatesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function idbGetAll(): Promise<TemplateRecord[]> {
  try {
    const db = await openTemplatesDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).get(IDB_LIST_KEY);
      r.onsuccess = () => {
        const raw = r.result;
        resolve(Array.isArray(raw) ? (raw as TemplateRecord[]) : []);
      };
      r.onerror = () => reject(r.error ?? new Error("indexedDB get failed"));
    });
  } catch {
    return [];
  }
}

async function idbPutAll(entries: TemplateRecord[]): Promise<void> {
  const db = await openTemplatesDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(entries, IDB_LIST_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
  });
}

function sortByUpdatedDesc(a: TemplateRecord, b: TemplateRecord): number {
  return b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, "de");
}

/** Merge zweier Bibliotheken: gleiche `id` → neueres `updatedAt` gewinnt. */
export function mergeTemplateLibraries(
  local: TemplateRecord[],
  incoming: TemplateRecord[],
): TemplateRecord[] {
  const byId = new Map<string, TemplateRecord>();
  for (const t of local) byId.set(t.id, t);
  for (const t of incoming) {
    const prev = byId.get(t.id);
    if (!prev || t.updatedAt >= prev.updatedAt) byId.set(t.id, t);
  }
  return [...byId.values()].sort(sortByUpdatedDesc);
}

export function parseTemplateRecord(raw: unknown, path = "template"): TemplateRecord {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: Objekt erwartet`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) {
    throw new Error(`${path}.id: nicht-leere Zeichenkette erwartet`);
  }
  if (typeof o.name !== "string" || !o.name.trim()) {
    throw new Error(`${path}.name: nicht-leere Zeichenkette erwartet`);
  }
  if (typeof o.updatedAt !== "number" || !Number.isFinite(o.updatedAt)) {
    throw new Error(`${path}.updatedAt: Zahl erwartet`);
  }
  if (o.description !== undefined && typeof o.description !== "string") {
    throw new Error(`${path}.description: Zeichenkette erwartet`);
  }
  // root validated via JSON round-trip helpers in callers that already have TaskNodeJson
  if (o.root == null || typeof o.root !== "object" || Array.isArray(o.root)) {
    throw new Error(`${path}.root: Objekt erwartet`);
  }
  return {
    id: o.id.trim(),
    name: o.name.trim(),
    ...(typeof o.description === "string" && o.description.trim()
      ? { description: o.description.trim() }
      : {}),
    updatedAt: o.updatedAt,
    root: o.root as TaskNodeJson,
  };
}

export function parseTemplatesArray(raw: unknown): TemplateRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    try {
      out.push(parseTemplateRecord(raw[i], `templates[${i}]`));
    } catch {
      /* skip invalid entries */
    }
  }
  return out.sort(sortByUpdatedDesc);
}

export async function hydrateTemplatesFromIdb(): Promise<TemplateRecord[]> {
  const entries = await idbGetAll();
  setCache(entries.sort(sortByUpdatedDesc));
  hydrated = true;
  return cache;
}

export function isTemplatesHydrated(): boolean {
  return hydrated;
}

async function persistCache(): Promise<void> {
  try {
    await idbPutAll(cache);
  } catch (e) {
    console.error("Template store:", e);
  }
}

export function createTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function templateFromSubtree(
  root: TaskNode,
  name: string,
  options?: { id?: string; description?: string; updatedAt?: number },
): TemplateRecord {
  const trimmed = name.trim() || root.title.trim() || "Vorlage";
  return {
    id: options?.id ?? createTemplateId(),
    name: trimmed,
    ...(options?.description?.trim() ? { description: options.description.trim() } : {}),
    updatedAt: options?.updatedAt ?? Date.now(),
    root: taskNodeToJson(root),
  };
}

export async function upsertTemplate(record: TemplateRecord): Promise<TemplateRecord> {
  const next = mergeTemplateLibraries(cache, [{ ...record, updatedAt: record.updatedAt || Date.now() }]);
  setCache(next);
  await persistCache();
  return next.find((t) => t.id === record.id) ?? record;
}

export async function saveTemplateFromSubtree(
  root: TaskNode,
  name: string,
  options?: { id?: string; description?: string },
): Promise<TemplateRecord> {
  const record = templateFromSubtree(root, name, options);
  return upsertTemplate(record);
}

export async function renameTemplate(id: string, name: string): Promise<TemplateRecord | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = cache.find((t) => t.id === id);
  if (!existing) return null;
  return upsertTemplate({ ...existing, name: trimmed, updatedAt: Date.now() });
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const next = cache.filter((t) => t.id !== id);
  if (next.length === cache.length) return false;
  setCache(next);
  await persistCache();
  return true;
}

/** Board-Templates in die Gerätebibliothek mergen. */
export async function mergeIncomingBoardTemplates(
  incoming: TemplateRecord[] | undefined | null,
): Promise<TemplateRecord[]> {
  if (!hydrated) await hydrateTemplatesFromIdb();
  if (!incoming?.length) return cache;
  const next = mergeTemplateLibraries(cache, incoming);
  setCache(next);
  await persistCache();
  return cache;
}

export function findTemplateByName(
  name: string,
  list: TemplateRecord[] = cache,
): TemplateRecord | undefined {
  const n = name.trim().toLowerCase();
  return list.find((t) => t.name.trim().toLowerCase() === n);
}

export function countTemplateNodes(root: TaskNodeJson): number {
  let n = 1;
  for (const ch of root.children ?? []) n += countTemplateNodes(ch);
  return n;
}

/** Wie viele Karten beim Einfügen entstehen (ohne Zielkarte). */
export function countInsertCards(root: TaskNodeJson, mode: TemplateInsertMode): number {
  if (mode === "wrapper") return countTemplateNodes(root);
  const kids = root.children ?? [];
  if (kids.length === 0) return 1;
  return kids.reduce((sum, ch) => sum + countTemplateNodes(ch), 0);
}

export function templateRootAsTaskNode(record: TemplateRecord): TaskNode {
  return taskNodeFromJson(record.root);
}

/** Outline-Zeilen für Vorschau. */
export function templateOutlineLines(
  root: TaskNodeJson,
  mode: TemplateInsertMode,
  maxLines = 24,
): string[] {
  const lines: string[] = [];
  const walk = (node: TaskNodeJson, depth: number) => {
    if (lines.length >= maxLines) return;
    const title = node.title.trim() || "(Ohne Titel)";
    lines.push(`${"  ".repeat(depth)}${title}`);
    for (const ch of node.children ?? []) walk(ch, depth + 1);
  };
  if (mode === "wrapper") {
    walk(root, 0);
  } else if ((root.children ?? []).length === 0) {
    walk(root, 0);
  } else {
    for (const ch of root.children ?? []) walk(ch, 0);
  }
  if (countInsertCards(root, mode) > lines.length) {
    lines.push("…");
  }
  return lines;
}

/** @internal test helper */
export async function clearTemplatesForTests(): Promise<void> {
  setCache([]);
  hydrated = true;
  try {
    await idbPutAll([]);
  } catch {
    /* ignore */
  }
}

/** @internal test helper */
export function setTemplatesCacheForTests(entries: TemplateRecord[]): void {
  setCache([...entries].sort(sortByUpdatedDesc));
  hydrated = true;
}

// Gerätebibliothek früh laden (vor erstem Arbeitsdatei-Save).
if (typeof indexedDB !== "undefined") {
  void hydrateTemplatesFromIdb();
}
