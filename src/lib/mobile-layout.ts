/** Tailwind `md` — darunter gilt die Mobil-Layout-Variante (kein Split View). */
export const MOBILE_LAYOUT_MEDIA_QUERY = "(max-width: 767px)";

export function subscribeMobileLayout(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

export function getMobileLayoutSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches;
}

/** SSR / vor Hydration: Desktop annehmen, damit kein Hydration-Mismatch. */
export function getMobileLayoutServerSnapshot(): boolean {
  return false;
}
