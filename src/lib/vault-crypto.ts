/**
 * Client-seitige Verschlüsselung für LOX-Vault (Zero-Knowledge).
 */

import { defaultLoxIdService } from "@/lib/lox-id";

const VAULT_MAGIC = new Uint8Array([0x54, 0x32, 0x56, 0x31]); // "T2V1"
const VAULT_SALT = new TextEncoder().encode("t2-vault-v1");
const IV_BYTES = 12;

export class VaultDecryptError extends Error {
  constructor(message = "Entschlüsselung fehlgeschlagen — LOX-ID prüfen.") {
    super(message);
    this.name = "VaultDecryptError";
  }
}

async function deriveVaultKey(loxId: string): Promise<CryptoKey> {
  const normalized = defaultLoxIdService.normalizeId(loxId);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalized),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: VAULT_SALT,
      info: new TextEncoder().encode("board"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBoardJson(loxId: string, json: string): Promise<ArrayBuffer> {
  const key = await deriveVaultKey(loxId);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(json),
  );
  const out = new Uint8Array(VAULT_MAGIC.length + IV_BYTES + ciphertext.byteLength);
  out.set(VAULT_MAGIC, 0);
  out.set(iv, VAULT_MAGIC.length);
  out.set(new Uint8Array(ciphertext), VAULT_MAGIC.length + IV_BYTES);
  return out.buffer;
}

export async function decryptBoardBlob(loxId: string, blob: ArrayBuffer): Promise<string> {
  const data = new Uint8Array(blob);
  if (data.length < VAULT_MAGIC.length + IV_BYTES + 16) {
    throw new VaultDecryptError();
  }
  for (let i = 0; i < VAULT_MAGIC.length; i++) {
    if (data[i] !== VAULT_MAGIC[i]) throw new VaultDecryptError("Unbekanntes Vault-Format.");
  }
  const iv = data.slice(VAULT_MAGIC.length, VAULT_MAGIC.length + IV_BYTES);
  const ciphertext = data.slice(VAULT_MAGIC.length + IV_BYTES);
  const key = await deriveVaultKey(loxId);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
  } catch {
    throw new VaultDecryptError();
  }
}
