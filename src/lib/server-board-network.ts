/**
 * Browser-Netzwerkstatus für Server-Board (Offline-Erkennung, Auto-Sync).
 */

export function isBrowserNetworkOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/** Typischer Fehler, wenn fetch ohne Antwort scheitert (offline, DNS, CORS-Abbruch). */
export function isFetchNetworkError(error: unknown): boolean {
  if (!isBrowserNetworkOnline()) return true;
  if (error instanceof TypeError) return true;
  return false;
}

export type NetworkStatusListener = (online: boolean) => void;

export function subscribeNetworkStatus(listener: NetworkStatusListener): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => listener(true);
  const onOffline = () => listener(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
