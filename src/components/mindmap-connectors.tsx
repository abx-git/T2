"use client";

import { useMemo } from "react";

import {
  columnLeftPx,
  MINDMAP_BOARD_PAD_Y,
  MINDMAP_COL_WIDTH_PX,
  mindmapBoardHeightPx,
  mindmapBoardWidthPx,
  rowTopPx,
  type MindmapBoardLayout,
} from "@/lib/mindmap-layout";

const CARD_ANCHOR_Y = 22;

function roundedElbowPath(x0: number, y0: number, x1: number, y1: number): string {
  const midX = (x0 + x1) / 2;
  const r = 8;
  if (Math.abs(y1 - y0) < 1) {
    return `M ${x0} ${y0} L ${x1} ${y1}`;
  }
  const dirY = y1 > y0 ? 1 : -1;
  const vertEnd = y1 - dirY * r;
  return [
    `M ${x0} ${y0}`,
    `L ${midX - r} ${y0}`,
    `Q ${midX} ${y0} ${midX} ${y0 + dirY * r}`,
    `L ${midX} ${vertEnd}`,
    `Q ${midX} ${y1} ${midX + r} ${y1}`,
    `L ${x1} ${y1}`,
  ].join(" ");
}

export function MindmapConnectors({
  layout,
  rowHeights,
}: {
  layout: MindmapBoardLayout;
  rowHeights: readonly number[];
}) {
  const paths = useMemo(() => {
    const out: { key: string; d: string }[] = [];
    for (const entry of layout.entries) {
      for (const ch of entry.node.children) {
        const childEntry = layout.byNodeId.get(ch.id);
        if (!childEntry) continue;
        const x0 = columnLeftPx(entry.column) + MINDMAP_COL_WIDTH_PX - 8;
        const y0 = MINDMAP_BOARD_PAD_Y + rowTopPx(entry.ySlot, rowHeights) + CARD_ANCHOR_Y;
        const x1 = columnLeftPx(childEntry.column) + 4;
        const y1 = MINDMAP_BOARD_PAD_Y + rowTopPx(childEntry.ySlot, rowHeights) + CARD_ANCHOR_Y;
        out.push({
          key: `${entry.node.id}->${ch.id}`,
          d: roundedElbowPath(x0, y0, x1, y1),
        });
      }
    }
    return out;
  }, [layout, rowHeights]);

  const width = mindmapBoardWidthPx(layout.columnCount);
  const height = mindmapBoardHeightPx(rowHeights);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-0"
      width={width}
      height={height}
      aria-hidden
    >
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-slate-300"
        />
      ))}
    </svg>
  );
}
