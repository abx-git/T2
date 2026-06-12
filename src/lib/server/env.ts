import path from "node:path";

export function getSessionSecret(): string | null {
  const s = process.env.T2_SESSION_SECRET?.trim();
  return s || null;
}

export function getAuthUsername(): string {
  return process.env.T2_AUTH_USERNAME?.trim() || "admin";
}

export function getAuthPassword(): string | null {
  const p = process.env.T2_AUTH_PASSWORD?.trim();
  return p || null;
}

/** `T2_SERVER_BOARD_ENABLED=0` — Host liefert nur die App; Speicher liegt beim Client (lokale Datei). */
export function isServerBoardFeatureEnabled(): boolean {
  const raw = process.env.T2_SERVER_BOARD_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
}

export function isServerBoardConfigured(): boolean {
  if (!isServerBoardFeatureEnabled()) return false;
  return Boolean(getSessionSecret() && getAuthPassword());
}

export function getBoardFilePath(): string {
  const raw = process.env.T2_BOARD_FILE_PATH?.trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  return path.join(process.cwd(), "data", "t2-board.json");
}

export function getBoardOpsFilePath(): string {
  const raw = process.env.T2_BOARD_OPS_FILE_PATH?.trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  const boardPath = getBoardFilePath();
  const dir = path.dirname(boardPath);
  const base = path.basename(boardPath, path.extname(boardPath));
  return path.join(dir, `${base}-ops.json`);
}
