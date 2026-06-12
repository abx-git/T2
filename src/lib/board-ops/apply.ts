import { mergeCardFieldVisibility } from "@/lib/card-field-visibility";
import { normalizeTaskLink } from "@/lib/task-link";
import { normalizeCompletedTag, normalizeTagLabel, tagKey } from "@/lib/task-tags";
import {
  applyMindmapDrop,
  detachNodeById,
  findNodeById,
  getSiblingsList,
  insertUnderParent,
  normalizePathIds,
  pathIdsAfterNodeMove,
  updateNodeFields,
} from "@/lib/tree-utils";
import type { BoardImportPayload } from "@/lib/task-tree-json";
import { refreshCalculatedEffortsInTree } from "@/lib/task-effort";
import { remapTaskNodeIds, taskNodeFromJson } from "@/lib/task-tree-json";
import type { TaskNode } from "@/types/task-node";

import type { BoardOpPayload, CardUpdateFieldsJson } from "./types";

function fieldsFromJson(fields: CardUpdateFieldsJson): Parameters<typeof updateNodeFields>[2] {
  const out: Parameters<typeof updateNodeFields>[2] = {};
  if (fields.title !== undefined) out.title = fields.title;
  if (fields.link !== undefined) out.link = normalizeTaskLink(fields.link);
  if (fields.description !== undefined) out.description = fields.description;
  if (fields.tags !== undefined) out.tags = fields.tags;
  if (fields.dueDate !== undefined) out.dueDate = fields.dueDate ? new Date(fields.dueDate) : null;
  if (fields.reminderDate !== undefined) {
    out.reminderDate = fields.reminderDate ? new Date(fields.reminderDate) : null;
  }
  if (fields.effort !== undefined) out.effort = fields.effort;
  if (fields.effortUnit !== undefined) out.effortUnit = fields.effortUnit;
  if (fields.effortSource !== undefined) out.effortSource = fields.effortSource;
  return out;
}

function parseColumnOverrides(raw: Record<string, string> | undefined): Record<number, string> {
  if (!raw) return {};
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0 && typeof v === "string" && v.trim()) {
      out[idx] = v.trim();
    }
  }
  return out;
}

export function applyBoardOp(state: BoardImportPayload, payload: BoardOpPayload): BoardImportPayload {
  switch (payload.type) {
    case "card.update": {
      if (!findNodeById(state.roots, payload.nodeId)) return state;
      const nextRoots = refreshCalculatedEffortsInTree(
        updateNodeFields(state.roots, payload.nodeId, fieldsFromJson(payload.fields)),
        normalizeCompletedTag(state.completedTag ?? "Erledigt"),
      );
      return {
        ...state,
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, state.pathIds),
      };
    }
    case "card.add": {
      if (findNodeById(state.roots, payload.nodeId)) return state;
      const card = taskNodeFromJson(payload.card);
      if (card.id !== payload.nodeId) return state;
      const nextRoots = refreshCalculatedEffortsInTree(
        insertUnderParent(state.roots, payload.parentId, payload.index, card),
        normalizeCompletedTag(state.completedTag ?? "Erledigt"),
      );
      return {
        ...state,
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, state.pathIds),
      };
    }
    case "card.remove": {
      const { next, detached } = detachNodeById(state.roots, payload.nodeId);
      if (!detached) return state;
      const nextRoots = refreshCalculatedEffortsInTree(
        next,
        normalizeCompletedTag(state.completedTag ?? "Erledigt"),
      );
      return {
        ...state,
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, state.pathIds),
      };
    }
    case "card.move": {
      const nextRoots = refreshCalculatedEffortsInTree(
        applyMindmapDrop(state.roots, state.pathIds, payload.activeId, payload.overKind),
        normalizeCompletedTag(state.completedTag ?? "Erledigt"),
      );
      const nextPath = pathIdsAfterNodeMove(nextRoots, payload.activeId, state.pathIds);
      return { ...state, roots: nextRoots, pathIds: nextPath };
    }
    case "board.settings": {
      const p = payload.patch;
      let filterTags = state.filterTags;
      if (p.filterTags !== undefined) {
        filterTags = p.filterTags
          .map((t) => normalizeTagLabel(t))
          .filter(Boolean)
          .filter((t, i, arr) => arr.findIndex((x) => tagKey(x) === tagKey(t)) === i);
      }
      return {
        ...state,
        ...(p.pathIds !== undefined
          ? { pathIds: normalizePathIds(state.roots, p.pathIds) }
          : {}),
        ...(p.collapsedIds !== undefined
          ? {
              collapsedIds: p.collapsedIds.filter((x): x is string => typeof x === "string"),
            }
          : {}),
        ...(p.columnTitleOverrides !== undefined
          ? { columnTitleOverrides: parseColumnOverrides(p.columnTitleOverrides) }
          : {}),
        ...(p.hideCompletedTasks !== undefined ? { hideCompletedTasks: p.hideCompletedTasks } : {}),
        ...(filterTags !== undefined ? { filterTags } : {}),
        ...(p.completedTag !== undefined
          ? { completedTag: normalizeCompletedTag(p.completedTag) }
          : {}),
        ...(p.effortOnTasksEnabled !== undefined ? { effortOnTasksEnabled: p.effortOnTasksEnabled } : {}),
        ...(p.cardFieldVisibility !== undefined
          ? { cardFieldVisibility: mergeCardFieldVisibility(p.cardFieldVisibility) }
          : {}),
      };
    }
    case "subtree.import": {
      if (payload.parentId !== null && !findNodeById(state.roots, payload.parentId)) return state;
      const fresh = remapTaskNodeIds(taskNodeFromJson(payload.root));
      if (payload.parentId === null) {
        const nextRoots = [...state.roots, fresh];
        return {
          ...state,
          roots: nextRoots,
          pathIds: normalizePathIds(nextRoots, state.pathIds),
        };
      }
      const sibs = getSiblingsList(state.roots, payload.parentId);
      const nextRoots = refreshCalculatedEffortsInTree(
        insertUnderParent(state.roots, payload.parentId, sibs.length, fresh),
        normalizeCompletedTag(state.completedTag ?? "Erledigt"),
      );
      return {
        ...state,
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, state.pathIds),
      };
    }
    default:
      return state;
  }
}

export function applyBoardOps(
  initial: BoardImportPayload,
  ops: BoardOpPayload[],
): BoardImportPayload {
  return ops.reduce((s, op) => applyBoardOp(s, op), initial);
}

export function applyBoardOpsFromClient(
  initial: BoardImportPayload,
  ops: { payload: BoardOpPayload }[],
): BoardImportPayload {
  return ops.reduce((s, op) => applyBoardOp(s, op.payload), initial);
}
