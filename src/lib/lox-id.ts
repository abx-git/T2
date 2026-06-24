/**
 * Lox-ID (aus apps/L2/lib/core/lox_id_service.dart): 4+4 Zeichen, Crockford-ähnliches Alphabet, Prüfziffer.
 */

const LOX_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LOX_CORE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const LOX_VALUE_BY_CHAR: Record<string, number> = Object.fromEntries(
  [...LOX_ALPHABET].map((c, i) => [c, i]),
) as Record<string, number>;

function checksumForPayload(payload7: string): string {
  let sum = 0;
  for (let i = 0; i < payload7.length; i++) {
    const char = payload7[i]!;
    const value = LOX_VALUE_BY_CHAR[char];
    if (value === undefined) {
      throw new Error(`Ungültiges Zeichen in Payload: ${char}`);
    }
    sum += value * (i + 3);
  }
  return LOX_ALPHABET[sum % LOX_ALPHABET.length]!;
}

function extractCore(id: string): string | null {
  const upper = id.toUpperCase();
  const parts = upper.split("-");
  if (parts.length >= 2) {
    const core = `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
    if (LOX_CORE_PATTERN.test(core)) return core;
  }
  if (LOX_CORE_PATTERN.test(upper)) return upper;
  return null;
}

export class LoxIdService {
  generateId(prefix?: string | null): string {
    const payload = Array.from({ length: 7 }, () => {
      const idx = Math.floor(Math.random() * LOX_ALPHABET.length);
      return LOX_ALPHABET[idx]!;
    }).join("");
    const checksum = checksumForPayload(payload);
    const chars = `${payload}${checksum}`;
    const core = `${chars.slice(0, 4)}-${chars.slice(4)}`;
    const p = prefix?.trim();
    if (!p) return core;
    return `${p.toUpperCase()}-${core}`;
  }

  validateId(id: string): boolean {
    const core = extractCore(id);
    if (!core || !LOX_CORE_PATTERN.test(core)) return false;
    const compact = core.replace(/-/g, "");
    if (compact.length !== 8) return false;
    const payload = compact.slice(0, 7);
    const expected = checksumForPayload(payload);
    return compact[7] === expected;
  }

  normalizeId(input: string): string {
    let s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
    s = s.replace(/O/g, "0").replace(/I/g, "1").replace(/L/g, "1");
    if (s.length < 8) return input.toUpperCase();
    const core = s.slice(0, 8);
    return `${core.slice(0, 4)}-${core.slice(4)}`;
  }

  /**
   * Kanonische Form für Vault-IDs — Prefix (z. B. BRD) bleibt erhalten.
   * `normalizeId` allein zerstört Prefix-IDs (BRD-XXXX-XXXX).
   */
  canonicalId(input: string): string | null {
    const upper = input.trim().toUpperCase();
    if (!this.validateId(upper)) return null;
    const parts = upper.split("-").filter((p) => p.length > 0);
    if (parts.length >= 3) {
      const prefix = parts.slice(0, -2).join("-");
      const core = `${parts[parts.length - 2]!}-${parts[parts.length - 1]!}`;
      const normCore = this.normalizeId(core);
      if (!this.validateId(normCore)) return null;
      return `${prefix}-${normCore}`;
    }
    return this.normalizeId(upper);
  }

  parseIdFromScanPayload(raw: string): string | null {
    const upper = raw.toUpperCase();
    const re = /[0-9A-Z\-]{8,}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(upper)) !== null) {
      const token = match[0]!;
      const strict = this.normalizeId(token);
      if (this.validateId(strict)) return strict;
      const fuzzy = this.normalizeIdForOcr(token);
      if (this.validateId(fuzzy)) return fuzzy;
    }
    return null;
  }

  extractIdsFromOcrText(raw: string): string[] {
    const out = new Set<string>();
    for (const token of raw.split(/\s+/)) {
      const strict = this.normalizeId(token);
      if (this.validateId(strict)) {
        out.add(strict);
        continue;
      }
      const fuzzy = this.normalizeIdForOcr(token);
      if (this.validateId(fuzzy)) out.add(fuzzy);
    }
    return [...out].sort();
  }

  private normalizeIdForOcr(input: string): string {
    let s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
    s = s.replace(/O/g, "0").replace(/I/g, "1").replace(/L/g, "1");
    s = s.replace(/B/g, "8").replace(/G/g, "6");
    if (s.length < 8) return input.toUpperCase();
    const core = s.slice(0, 8);
    return `${core.slice(0, 4)}-${core.slice(4)}`;
  }
}

export const defaultLoxIdService = new LoxIdService();

export function isLoxTaskId(id: string): boolean {
  return defaultLoxIdService.validateId(id);
}

/** Kanonische Board-/Vault-LOX-ID (mit Prefix BRD-…). */
export function canonicalBoardLoxId(raw: string): string | null {
  return defaultLoxIdService.canonicalId(raw);
}
