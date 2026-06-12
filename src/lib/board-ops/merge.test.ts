import { describe, expect, it } from "vitest";

import { applyBoardOp } from "./apply";
import { mergeOpsChronologically } from "./merge";
import type { ClientBoardOp, StoredBoardOp } from "./types";
import { buildBoardSnapshot, stringifyExportedDocument } from "@/lib/task-tree-json";
import { boardPayloadFromExportJson } from "./reconcile";
import type { TaskNode } from "@/types/task-node";

function node(id: string, title: string): TaskNode {
  return {
    id,
    title,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children: [],
  };
}

function emptyBoardJson() {
  return stringifyExportedDocument(
    buildBoardSnapshot([node("a", "Start")], [], {}, undefined, false, true),
  );
}

function clientOp(
  opId: string,
  at: string,
  clientId: string,
  payload: ClientBoardOp["payload"],
): ClientBoardOp {
  return { opId, at, clientId, payload };
}

describe("mergeOpsChronologically", () => {
  it("orders by timestamp across clients", () => {
    const ops = mergeOpsChronologically(
      [clientOp("b", "2026-01-02T10:00:00.000Z", "B", { type: "card.update", nodeId: "a", fields: { title: "B" } })],
      [clientOp("a", "2026-01-02T09:00:00.000Z", "A", { type: "card.update", nodeId: "a", fields: { title: "A" } })],
    );
    expect(ops).toHaveLength(2);
    expect(ops[0]?.opId).toBe("a");
    expect(ops[1]?.opId).toBe("b");
  });

  it("dedupes by opId", () => {
    const op = clientOp("x", "2026-01-01T00:00:00.000Z", "A", {
      type: "card.update",
      nodeId: "a",
      fields: { title: "Once" },
    });
    const merged = mergeOpsChronologically([op], [op]);
    expect(merged).toHaveLength(1);
  });
});

describe("applyBoardOp multi-client", () => {
  it("applies updates from two clients in time order", () => {
    let state = boardPayloadFromExportJson(emptyBoardJson());
    const ops: StoredBoardOp[] = [
      { seq: 1, ...clientOp("1", "2026-01-01T10:00:00.000Z", "A", { type: "card.update", nodeId: "a", fields: { title: "A" } }) },
      { seq: 2, ...clientOp("2", "2026-01-01T11:00:00.000Z", "B", { type: "card.update", nodeId: "a", fields: { title: "B wins" } }) },
    ];
    for (const op of mergeOpsChronologically(ops)) {
      state = applyBoardOp(state, op.payload);
    }
    expect(state.roots[0]?.title).toBe("B wins");
  });
});
