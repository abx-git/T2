/**
 * Per-tab document binding — wf-first.
 *
 * Identity (bookmark / restore / locks / IDB): URL `?wf=` wins over sessionStorage.wf
 * (so browser bookmarks / deep-links reopen the intended file in the same tab).
 * Label (footer / document.title): session label, never used as identity
 *
 * Legacy: old bookmarks may still have `?filename=` — read once for restore, then
 * rewrite the URL to wf-only.
 */

export const WORKING_FILE_ID_URL_PARAM = "wf";
/** @deprecated identity is `wf`; kept only to read old bookmarks */
export const WORKING_FILE_URL_PARAM = "filename";

const SS_TAB_SESSION_ID = "t2.working-file.tab-session-id";
const SS_ACTIVE_CONTEXT = "t2.working-file.tab-context";
const APP_DOCUMENT_TITLE = "T2";

export interface TabWorkingFileContext {
  /** Display name only (handle basename). */
  label: string | null;
  /** Unique working-file slot id (IndexedDB / Web Lock / bookmark identity). */
  wf: string | null;
  attachedAt: number | null;
}

/** Normalize for display comparison (case-insensitive basename). */
export function normalizeWorkingFilename(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "";
  const base = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return base.trim().toLowerCase();
}

export function createWorkingFileId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateTabSessionId(): string {
  if (typeof sessionStorage === "undefined") return "ssr";
  try {
    const existing = sessionStorage.getItem(SS_TAB_SESSION_ID)?.trim();
    if (existing) return existing;
    const id = createWorkingFileId();
    sessionStorage.setItem(SS_TAB_SESSION_ID, id);
    return id;
  } catch {
    return `tab-${Date.now()}`;
  }
}

/** Legacy bookmark label — not identity. */
export function readFilenameFromUrl(search?: string): string | null {
  if (typeof window === "undefined" && search === undefined) return null;
  try {
    const raw =
      search ??
      (typeof window !== "undefined" ? window.location.search : "");
    const value = new URLSearchParams(raw).get(WORKING_FILE_URL_PARAM)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function readWorkingFileIdFromUrl(search?: string): string | null {
  if (typeof window === "undefined" && search === undefined) return null;
  try {
    const raw =
      search ??
      (typeof window !== "undefined" ? window.location.search : "");
    const value = new URLSearchParams(raw).get(WORKING_FILE_ID_URL_PARAM)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function syncWorkingFileDocumentTitle(label: string | null): void {
  if (typeof document === "undefined") return;
  const name = label?.trim();
  document.title = name ? `${name} · ${APP_DOCUMENT_TITLE}` : APP_DOCUMENT_TITLE;
}

/**
 * Reflect slot identity in the URL: only `?wf=`.
 * Strips legacy `?filename=` so bookmarks stay unambiguous.
 * Preserves other params (e.g. room).
 */
export function syncWorkingFileIdInUrl(wf: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const nextWf = wf?.trim() || "";
    const loc = new URLSearchParams(window.location.search);
    const prevWf = loc.get(WORKING_FILE_ID_URL_PARAM)?.trim() || "";
    const hadLegacyName = Boolean(loc.get(WORKING_FILE_URL_PARAM)?.trim());
    if (prevWf === nextWf && !hadLegacyName) return;

    const url = new URL(window.location.href);
    if (nextWf) url.searchParams.set(WORKING_FILE_ID_URL_PARAM, nextWf);
    else url.searchParams.delete(WORKING_FILE_ID_URL_PARAM);
    url.searchParams.delete(WORKING_FILE_URL_PARAM);

    const next = `${url.pathname}${url.search}${url.hash}`;
    const prevState = window.history.state;
    const state =
      prevState && typeof prevState === "object"
        ? { ...(prevState as Record<string, unknown>), as: next, url: next }
        : (prevState ?? {});
    window.history.replaceState(state, "", next);
  } catch {
    /* ignore */
  }
}

/** @deprecated use syncWorkingFileIdInUrl */
export function syncWorkingFileParamsInUrl(_fileName: string | null, wf: string | null): void {
  syncWorkingFileIdInUrl(wf);
}

/** @deprecated use bindTabWorkingFile */
export function syncFilenameInUrl(fileName: string | null): void {
  const wf = fileName?.trim()
    ? getTabWorkingFileContext().wf ?? readWorkingFileIdFromUrl()
    : null;
  bindTabWorkingFile(wf, fileName);
}

export function getTabWorkingFileContext(): TabWorkingFileContext {
  if (typeof sessionStorage === "undefined") {
    return { label: null, wf: null, attachedAt: null };
  }
  try {
    const raw = sessionStorage.getItem(SS_ACTIVE_CONTEXT);
    if (!raw) return { label: null, wf: null, attachedAt: null };
    const parsed = JSON.parse(raw) as Partial<TabWorkingFileContext> & {
      filename?: string;
    };
    const label =
      (typeof parsed.label === "string" && parsed.label.trim()) ||
      (typeof parsed.filename === "string" && parsed.filename.trim()) ||
      null;
    const wf =
      typeof parsed.wf === "string" && parsed.wf.trim() ? parsed.wf.trim() : null;
    const attachedAt =
      typeof parsed.attachedAt === "number" && Number.isFinite(parsed.attachedAt)
        ? parsed.attachedAt
        : null;
    return { label: label?.trim() || null, wf, attachedAt };
  } catch {
    return { label: null, wf: null, attachedAt: null };
  }
}

export function setTabWorkingFileContext(wf: string | null, label: string | null = null): void {
  getOrCreateTabSessionId();
  if (typeof sessionStorage === "undefined") return;
  try {
    const trimmedWf = wf?.trim() || null;
    const trimmedLabel = label?.trim() || null;
    if (!trimmedWf && !trimmedLabel) {
      sessionStorage.removeItem(SS_ACTIVE_CONTEXT);
      return;
    }
    const record: TabWorkingFileContext = {
      wf: trimmedWf,
      label: trimmedLabel,
      attachedAt: Date.now(),
    };
    sessionStorage.setItem(SS_ACTIVE_CONTEXT, JSON.stringify(record));
  } catch {
    /* ignore */
  }
}

/**
 * Preferred slot id for restore: URL `?wf=` → session.
 * URL wins so bookmarks reopen the bookmarked file even when session still
 * points at a later-opened board. No localStorage — that would steal another tab's file.
 */
export function resolvePreferredWorkingFileId(): string | null {
  const fromUrl = readWorkingFileIdFromUrl();
  if (fromUrl) return fromUrl;
  return getTabWorkingFileContext().wf;
}

/**
 * Preferred display label hint (not identity):
 * session label → legacy `?filename=`
 * When URL `?wf=` disagrees with session, ignore the stale session label.
 */
export function resolvePreferredWorkingFileName(): string | null {
  const urlWf = readWorkingFileIdFromUrl();
  const session = getTabWorkingFileContext();
  if (urlWf && session.wf && urlWf !== session.wf) {
    return readFilenameFromUrl();
  }
  if (session.label) return session.label;
  return readFilenameFromUrl();
}

/**
 * Bind this tab's document: `wf` is identity, `label` is UI/title only.
 * Cleared with `bindTabWorkingFile(null)`.
 */
export function bindTabWorkingFile(wf: string | null, label: string | null = null): void {
  const trimmedWf = wf?.trim() || null;
  const trimmedLabel = label?.trim() || null;
  setTabWorkingFileContext(trimmedWf, trimmedLabel);
  syncWorkingFileIdInUrl(trimmedWf);
  syncWorkingFileDocumentTitle(trimmedLabel);
}

/**
 * @deprecated prefer bindTabWorkingFile(wf, label) — argument order was (label, wf).
 */
export function bindTabWorkingFileName(fileName: string | null, wf: string | null = null): void {
  bindTabWorkingFile(wf, fileName);
}
