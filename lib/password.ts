/**
 * Hash de senhas (bcrypt). Server-side e client-side.
 *
 * Migração suave:
 *  - `isHashed(s)` reconhece o formato bcrypt (`$2a$`, `$2b$`, `$2y$`)
 *  - `verifyPassword(plain, stored)`:
 *      • se `stored` for hash → bcrypt.compareSync
 *      • se for texto puro → compara direto (migração)
 *  - `ensureHashed(s)` devolve hash quando vier texto puro.
 */
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function isHashed(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^\$2[aby]\$\d{2}\$/.test(s);
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!plain || !stored) return false;
  if (isHashed(stored)) {
    try {
      return bcrypt.compareSync(plain, stored);
    } catch {
      return false;
    }
  }
  return plain === stored;
}

export function ensureHashed(s: string): string {
  return isHashed(s) ? s : hashPassword(s);
}
