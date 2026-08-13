"use client";

import { useEffect, useRef } from "react";

import {
  type BackupIntervalMinutes,
  boardNeedsSafetyBackup,
  createBoardBackupNow,
  formatLastBackupLabel,
  readLastBackupAt,
  rememberBackupBaselineFromStore,
} from "@/lib/board-backup";

export interface BoardBackupSyncProps {
  intervalMinutes: BackupIntervalMinutes;
  onLastBackupChange: (label: string) => void;
}

/** Runs timed backups while `intervalMinutes > 0` (only when the board changed). */
export function BoardBackupSync({ intervalMinutes, onLastBackupChange }: BoardBackupSyncProps) {
  const onChangeRef = useRef(onLastBackupChange);
  onChangeRef.current = onLastBackupChange;

  useEffect(() => {
    onChangeRef.current(formatLastBackupLabel(readLastBackupAt()));
  }, []);

  useEffect(() => {
    if (intervalMinutes <= 0) return;
    // Baseline = current stand so the first tick does not download without a change.
    rememberBackupBaselineFromStore();
    const ms = intervalMinutes * 60_000;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      // Timed backups only while the editor stand is not synced to the Arbeitsdatei.
      if (!boardNeedsSafetyBackup()) return;
      void (async () => {
        const result = await createBoardBackupNow({ onlyIfChanged: true });
        if (!result.skipped) {
          onChangeRef.current(formatLastBackupLabel(readLastBackupAt()));
        }
      })();
    }, ms);
    return () => window.clearInterval(id);
  }, [intervalMinutes]);

  return null;
}

export async function runManualBoardBackup(onDone?: (label: string) => void): Promise<void> {
  const result = await createBoardBackupNow({
    allowEmpty: true,
    allowPickRollingFile: true,
  });
  if (result.skipped) {
    window.alert("Kein Board-Inhalt zum Sichern.");
    return;
  }
  onDone?.(formatLastBackupLabel(readLastBackupAt()));
}
