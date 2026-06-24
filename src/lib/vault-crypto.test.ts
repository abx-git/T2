import { describe, expect, it } from "vitest";

import { defaultLoxIdService } from "./lox-id";
import { decryptBoardBlob, encryptBoardJson, VaultDecryptError } from "./vault-crypto";

const LOX_ID = defaultLoxIdService.generateId("BRD");

describe("vault-crypto", () => {
  it("roundtrips board json", async () => {
    const json = '{"roots":[],"scope":"board"}';
    const blob = await encryptBoardJson(LOX_ID, json);
    const out = await decryptBoardBlob(LOX_ID, blob);
    expect(out).toBe(json);
  });

  it("fails decrypt with wrong id", async () => {
    const blob = await encryptBoardJson(LOX_ID, '{"roots":[]}');
    await expect(decryptBoardBlob("BRD-WXYZ-1234", blob)).rejects.toBeInstanceOf(VaultDecryptError);
  });

  it("fails on truncated blob", async () => {
    await expect(decryptBoardBlob(LOX_ID, new ArrayBuffer(8))).rejects.toBeInstanceOf(VaultDecryptError);
  });
});
