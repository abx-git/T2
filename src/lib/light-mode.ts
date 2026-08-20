const LS_KEY = "t2-light-mode";

/** UI-Präferenz: nur Baum, ohne Karten-Panes und Seitenleisten. */
export function readLightModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLightModeEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, on ? "1" : "0");
  } catch {
    /* Quota / private mode */
  }
}
