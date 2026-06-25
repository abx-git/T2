import { describe, expect, it } from "vitest";

import { LoxIdService, parseBoardVaultLoxIdFromInput } from "./lox-id";

describe("LoxIdService", () => {
  const svc = new LoxIdService();

  it("generates valid ids", () => {
    for (let i = 0; i < 50; i++) {
      const id = svc.generateId();
      expect(svc.validateId(id)).toBe(true);
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    }
  });

  it("supports optional prefix", () => {
    const id = svc.generateId("tsk");
    expect(id.startsWith("TSK-")).toBe(true);
    expect(svc.validateId(id)).toBe(true);
  });

  it("normalizes and validates checksum", () => {
    const id = svc.generateId();
    const compact = id.replace(/-/g, "");
    const normalized = svc.normalizeId(compact);
    expect(svc.validateId(normalized)).toBe(true);
    const bad = `${normalized.slice(0, -1)}0`;
    expect(svc.validateId(bad)).toBe(false);
  });

  it("parses id from scan payload", () => {
    const id = svc.generateId();
    expect(svc.parseIdFromScanPayload(`foo ${id} bar`)).toBe(id);
  });

  it("canonicalId preserves BRD prefix for vault boards", () => {
    const id = svc.generateId("BRD");
    expect(id.startsWith("BRD-")).toBe(true);
    expect(svc.validateId(id)).toBe(true);
    const canonical = svc.canonicalId(id);
    expect(canonical).toBe(id);
    expect(svc.canonicalId(id.toLowerCase())).toBe(id);
    // normalizeId alone would corrupt prefixed ids
    expect(svc.normalizeId(id)).not.toBe(id);
  });
});

describe("parseBoardVaultLoxIdFromInput", () => {
  const boardSvc = new LoxIdService();

  it("accepts BRD-prefixed ids in common input forms", () => {
    const id = boardSvc.generateId("BRD");
    expect(parseBoardVaultLoxIdFromInput(id)).toBe(id);
    expect(parseBoardVaultLoxIdFromInput(id.toLowerCase())).toBe(id);
    expect(parseBoardVaultLoxIdFromInput(id.replace(/-/g, " "))).toBe(id);
    expect(parseBoardVaultLoxIdFromInput(id.replace(/-/g, ""))).toBe(id);
  });

  it("rejects shortened card-style display ids", () => {
    const id = boardSvc.generateId("BRD");
    const shortened = boardSvc.normalizeId(id);
    expect(shortened).not.toBe(id);
    expect(parseBoardVaultLoxIdFromInput(shortened)).toBeNull();
    expect(parseBoardVaultLoxIdFromInput(`BRD-${shortened}`)).toBeNull();
  });

  it("rejects BRD prepended to corrupted display tokens", () => {
    expect(parseBoardVaultLoxIdFromInput("BRD-BRDV-RW5W")).toBeNull();
  });
});
