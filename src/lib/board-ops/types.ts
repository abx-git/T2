import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import type { TreeDragOverKind } from "@/lib/tree-utils";
import type { TaskNodeJson } from "@/lib/task-tree-json";

/** Felder einer Karten-Aktualisierung (ISO-Datumstrings). */
export interface CardUpdateFieldsJson {
  title?: string;
  link?: string;
  description?: string;
  tags?: string[];
  dueDate?: string | null;
  reminderDate?: string | null;
  effort?: number;
  effortUnit?: "hours" | "minutes" | "workdays";
  effortSource?: "manual" | "calculated";
}

export type BoardOpPayload =
  | { type: "card.update"; nodeId: string; fields: CardUpdateFieldsJson }
  | { type: "card.add"; nodeId: string; parentId: string | null; index: number; card: TaskNodeJson }
  | { type: "card.remove"; nodeId: string }
  | { type: "card.move"; activeId: string; overKind: TreeDragOverKind }
  | {
      type: "board.settings";
      patch: {
        pathIds?: string[];
        collapsedIds?: string[];
        columnTitleOverrides?: Record<string, string>;
        hideCompletedTasks?: boolean;
        filterTags?: string[];
        completedTag?: string;
        effortOnTasksEnabled?: boolean;
        cardFieldVisibility?: CardFieldVisibility;
      };
    }
  | { type: "subtree.import"; parentId: string | null; root: TaskNodeJson };

/** Vom Client erzeugt, noch ohne Server-`seq`. */
export interface ClientBoardOp {
  opId: string;
  clientId: string;
  at: string;
  payload: BoardOpPayload;
}

/** Nach Persistenz auf dem Server. */
export interface StoredBoardOp extends ClientBoardOp {
  seq: number;
}

export interface BoardOpsFileV1 {
  version: 1;
  headSeq: number;
  ops: StoredBoardOp[];
}

export const BOARD_OPS_FORMAT_VERSION = 1 as const;
