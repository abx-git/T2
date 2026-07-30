/**
 * Zonen-bewusste Collision Detection für Board-DnD.
 * Outline-Drops nur, wenn der Zeiger über dem Struktur-Bereich liegt —
 * kein zonenübergreifendes closestCenter in den linken Baum.
 */

import {
  closestCenter,
  pointerWithin,
  type Collision,
  type CollisionDetection,
  type DroppableContainer,
} from "@dnd-kit/core";

import {
  CLIPBOARD_DROP_TARGET_ID,
  CLIPBOARD_SIDEBAR_DROP_ID,
} from "@/lib/clipboard-dnd";

export type ClientPoint = { x: number; y: number };

export type ClientRectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function pointInClientRect(point: ClientPoint, rect: ClientRectLike): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

export function boundingRectOf(
  rects: Iterable<ClientRectLike | null | undefined>,
): ClientRectLike | null {
  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  let any = false;
  for (const r of rects) {
    if (!r) continue;
    any = true;
    minL = Math.min(minL, r.left);
    minT = Math.min(minT, r.top);
    maxR = Math.max(maxR, r.left + r.width);
    maxB = Math.max(maxB, r.top + r.height);
  }
  if (!any) return null;
  return { left: minL, top: minT, width: maxR - minL, height: maxB - minT };
}

function droppableKind(container: DroppableContainer): string | undefined {
  return container.data.current?.kind as string | undefined;
}

export function isOutlineDroppable(container: DroppableContainer): boolean {
  const kind = droppableKind(container);
  return kind === "outlineGap" || kind === "outlineNest";
}

export function isContextDroppable(container: DroppableContainer): boolean {
  const kind = droppableKind(container);
  return kind === "contextNest" || kind === "contextGap" || String(container.id).startsWith("context-gap:");
}

/** True, wenn der Zeiger im Bounding-Box-Bereich der Outline-Droppables liegt. */
export function pointerOverOutlineZone(
  pointer: ClientPoint,
  outlineRects: Iterable<ClientRectLike | null | undefined>,
): boolean {
  const bounds = boundingRectOf(outlineRects);
  return Boolean(bounds && pointInClientRect(pointer, bounds));
}

function collisionFor(container: DroppableContainer): Collision[] {
  return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
}

export const boardCollisionDetection: CollisionDetection = (args) => {
  const activeSource = args.active.data.current?.source as string | undefined;
  const { pointerCoordinates, droppableContainers, droppableRects } = args;

  if (pointerCoordinates) {
    for (const container of droppableContainers) {
      const kind = droppableKind(container);
      if (kind !== "clipboardGap" && kind !== "clipboardCard") continue;
      const rect = droppableRects.get(container.id);
      if (!rect || !pointInClientRect(pointerCoordinates, rect)) continue;
      return collisionFor(container);
    }
    if (activeSource !== "clipboard") {
      for (const id of [CLIPBOARD_DROP_TARGET_ID, CLIPBOARD_SIDEBAR_DROP_ID]) {
        const rect = droppableRects.get(id);
        const container = droppableContainers.find((c) => String(c.id) === id);
        if (rect && container && pointInClientRect(pointerCoordinates, rect)) {
          return collisionFor(container);
        }
      }
    }
  }

  const hits = pointerWithin(args);
  if (hits.length > 0) {
    const clip = hits.find(
      (c) =>
        String(c.id) === CLIPBOARD_DROP_TARGET_ID ||
        String(c.id) === CLIPBOARD_SIDEBAR_DROP_ID ||
        String(c.id).startsWith("clipboard-gap:"),
    );
    if (clip && activeSource !== "clipboard") return [clip];

    const outlineRects = droppableContainers
      .filter(isOutlineDroppable)
      .map((c) => droppableRects.get(c.id));
    const overOutline =
      !pointerCoordinates || pointerOverOutlineZone(pointerCoordinates, outlineRects);

    if (overOutline) {
      const outlineGap = hits.find((c) => String(c.id).startsWith("outline-gap:"));
      if (outlineGap) return [outlineGap];
      const outlineNest = hits.find(
        (c) => c.data?.droppableContainer?.data?.current?.kind === "outlineNest",
      );
      if (outlineNest) return [outlineNest];
    }

    const nest = hits.find((c) => c.data?.droppableContainer?.data?.current?.kind === "contextNest");
    if (nest) return [nest];
    const gap = hits.find((c) => String(c.id).startsWith("context-gap:"));
    if (gap) return [gap];
    return [hits[0]!];
  }

  // Kein pointerWithin-Treffer: closestCenter nur innerhalb der Zone unter dem Zeiger.
  if (pointerCoordinates) {
    const outlineContainers = droppableContainers.filter(isOutlineDroppable);
    const contextContainers = droppableContainers.filter(isContextDroppable);
    const outlineRects = outlineContainers.map((c) => droppableRects.get(c.id));

    if (
      outlineContainers.length > 0 &&
      pointerOverOutlineZone(pointerCoordinates, outlineRects)
    ) {
      return closestCenter({ ...args, droppableContainers: outlineContainers });
    }

    if (contextContainers.length > 0) {
      return closestCenter({ ...args, droppableContainers: contextContainers });
    }
  }

  return [];
};
