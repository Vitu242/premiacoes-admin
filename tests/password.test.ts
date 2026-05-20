import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isHashed, ensureHashed } from "../lib/password";

describe("password", () => {
  it("isHashed", () => {
    expect(isHashed("$2a$10$abcdefghij")).toBe(true);
    expect(isHashed("plaintext")).toBe(false);
    expect(isHashed("")).toBe(false);
  });

  it("hash + verify", () => {
    const h = hashPassword("minha-senha");
    expect(h).not.toBe("minha-senha");
    expect(verifyPassword("minha-senha", h)).toBe(true);
    expect(verifyPassword("errada", h)).toBe(false);
  });

  it("fallback texto puro (migração suave)", () => {
    expect(verifyPassword("123", "123")).toBe(true);
    expect(verifyPassword("123", "456")).toBe(false);
  });

  it("ensureHashed retorna hash sempre", () => {
    expect(isHashed(ensureHashed("plain"))).toBe(true);
    const h = hashPassword("x");
    expect(ensureHashed(h)).toBe(h);
  });
});
