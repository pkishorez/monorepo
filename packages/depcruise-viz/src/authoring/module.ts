import type { ModuleDecl } from '../types.js';

/**
 * Declares a module: a folder in exactly one layer identified by `path`.
 * Set `barrel: true` for re-export fan-out points that are exempt from
 * feature-closure and coverage enforcement.
 */
export function module(path: string, opts?: { barrel?: boolean }): ModuleDecl {
  if (path.length === 0) {
    throw new Error('Module path must not be empty');
  }
  return { path, barrel: opts?.barrel ?? false };
}
