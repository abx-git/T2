import { getBoardOpsClientId } from "./client-id";
import { enqueueBoardOp } from "./queue";
import type { BoardOpPayload, ClientBoardOp } from "./types";

let recordingEnabled = true;
let applyingRemoteOps = false;

export function setBoardOpRecording(enabled: boolean): void {
  recordingEnabled = enabled;
}

export function setApplyingRemoteBoardOps(applying: boolean): void {
  applyingRemoteOps = applying;
}

export function createClientBoardOp(payload: BoardOpPayload): ClientBoardOp {
  return {
    opId: crypto.randomUUID(),
    clientId: getBoardOpsClientId(),
    at: new Date().toISOString(),
    payload,
  };
}

/** Eine Benutzer-Änderung in die lokale Warteschlange stellen (wird an den Server gesendet). */
export function recordBoardOp(payload: BoardOpPayload): ClientBoardOp | null {
  if (!recordingEnabled || applyingRemoteOps) return null;
  const op = createClientBoardOp(payload);
  enqueueBoardOp(op);
  return op;
}
