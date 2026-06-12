/** Touch-first / grobe Zeiger (typisch Mobilgerät). */
export function isCoarsePointerDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
