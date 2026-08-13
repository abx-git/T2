/**
 * Single-writer lock per working-file slot (`wf` id) within one browser profile.
 * Visible tab holds an exclusive Web Lock; hidden tabs must not push to disk.
 */

export type FileWriterRole = "leader" | "follower";

type RoleListener = (role: FileWriterRole) => void;

export interface FileTabWriterController {
  getRole: () => FileWriterRole;
  isLeader: () => boolean;
  start: () => void;
  stop: () => void;
  onRoleChange: (listener: RoleListener) => () => void;
}

export function lockNameForWorkingFile(fileKey: string): string {
  const key = fileKey.trim().toLowerCase() || "unnamed";
  return `t2-working-file-writer:${key}`;
}

function supportsWebLocks(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
}

/** Exported for UI banner when multi-tab writes are unsafe. */
export function supportsWorkingFileWebLocks(): boolean {
  return supportsWebLocks();
}

function waitUntilVisible(isStopped: () => boolean): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (isStopped() || document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onChange);
        resolve();
      }
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

/** Create a per-slot writer controller. Call start() after attach, stop() on detach. */
export function createFileTabWriter(fileKey: string): FileTabWriterController {
  const lockName = lockNameForWorkingFile(fileKey);
  let role: FileWriterRole = "follower";
  let stopped = true;
  const listeners = new Set<RoleListener>();
  let abort: AbortController | null = null;
  let releaseLock: (() => void) | null = null;
  let lockLoopActive = false;
  const visibilityHandlers: Array<() => void> = [];

  const emit = (next: FileWriterRole) => {
    if (role === next) return;
    role = next;
    for (const listener of listeners) {
      try {
        listener(role);
      } catch {
        /* ignore */
      }
    }
  };

  const addVisibilityHandler = (handler: () => void) => {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", handler);
    visibilityHandlers.push(handler);
  };

  const clearVisibilityHandlers = () => {
    if (typeof document === "undefined") return;
    for (const handler of visibilityHandlers) {
      document.removeEventListener("visibilitychange", handler);
    }
    visibilityHandlers.length = 0;
  };

  async function runLockLoop(): Promise<void> {
    if (!supportsWebLocks() || lockLoopActive) return;
    lockLoopActive = true;

    while (!stopped) {
      await waitUntilVisible(() => stopped);
      if (stopped) break;

      abort = new AbortController();
      try {
        await navigator.locks.request(lockName, { signal: abort.signal }, async () => {
          if (stopped) return;
          if (typeof document !== "undefined" && document.visibilityState !== "visible") {
            return;
          }
          emit("leader");
          await new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          releaseLock = null;
          if (!stopped) emit("follower");
        });
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        if (name !== "AbortError" && !stopped) {
          emit("leader");
          break;
        }
      }

      if (!stopped) await new Promise((r) => setTimeout(r, 20));
    }

    lockLoopActive = false;
  }

  return {
    getRole: () => role,
    isLeader: () => role === "leader",
    onRoleChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => {
      stopped = false;
      if (supportsWebLocks()) {
        emit("follower");
        addVisibilityHandler(() => {
          if (stopped) return;
          if (document.visibilityState === "hidden" && role === "leader") {
            releaseLock?.();
            releaseLock = null;
          }
        });
        void runLockLoop();
      } else if (typeof document !== "undefined") {
        emit(document.visibilityState === "visible" ? "leader" : "follower");
        addVisibilityHandler(() => {
          if (stopped) return;
          emit(document.visibilityState === "visible" ? "leader" : "follower");
        });
      } else {
        emit("leader");
      }
    },
    stop: () => {
      stopped = true;
      clearVisibilityHandlers();
      abort?.abort();
      releaseLock?.();
      releaseLock = null;
      listeners.clear();
      role = "follower";
    },
  };
}

/** Deterministic leader for unit tests (no Web Locks). */
export function createAlwaysLeaderFileWriter(): FileTabWriterController {
  let role: FileWriterRole = "leader";
  const listeners = new Set<RoleListener>();
  return {
    getRole: () => role,
    isLeader: () => role === "leader",
    start: () => {
      role = "leader";
    },
    stop: () => {
      role = "follower";
    },
    onRoleChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Module-level writer for the currently attached Arbeitsdatei in this tab. */
let activeWriter: FileTabWriterController | null = null;
let activeWriterFileKey: string | null = null;
const globalRoleListeners = new Set<RoleListener>();
let unsubscribeActive: (() => void) | null = null;

function emitGlobalRole(role: FileWriterRole): void {
  for (const listener of globalRoleListeners) {
    try {
      listener(role);
    } catch {
      /* ignore */
    }
  }
}

export function ensureWorkingFileWriter(fileKey: string): FileTabWriterController {
  const trimmed = fileKey.trim();
  if (activeWriter && activeWriterFileKey && activeWriterFileKey === trimmed) {
    return activeWriter;
  }
  stopWorkingFileWriter();
  activeWriterFileKey = trimmed;
  activeWriter = createFileTabWriter(trimmed);
  unsubscribeActive = activeWriter.onRoleChange(emitGlobalRole);
  activeWriter.start();
  return activeWriter;
}

export function stopWorkingFileWriter(): void {
  unsubscribeActive?.();
  unsubscribeActive = null;
  activeWriter?.stop();
  activeWriter = null;
  activeWriterFileKey = null;
  emitGlobalRole("follower");
}

export function isWorkingFileWriterLeader(): boolean {
  // No attached writer ⇒ solo tab behavior (allow writes).
  if (!activeWriter) return true;
  return activeWriter.isLeader();
}

export function getWorkingFileWriterRole(): FileWriterRole {
  if (!activeWriter) return "leader";
  return activeWriter.getRole();
}

export function onWorkingFileWriterRoleChange(listener: RoleListener): () => void {
  globalRoleListeners.add(listener);
  return () => globalRoleListeners.delete(listener);
}

export function getActiveWorkingFileWriterName(): string | null {
  return activeWriterFileKey;
}
