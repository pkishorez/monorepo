import type { ModuleDecl, Visibility } from '../types.js';

/**
 * Declares a module: a folder owned by an optional feature with a resolved
 * visibility. Default visibility is `private` when a feature is set, else
 * `public`. Passing `sharedWith` forces `shared`; `shared` requires a
 * non-empty `sharedWith`.
 */
export function module(
  path: string,
  opts?: {
    feature?: string;
    visibility?: Visibility;
    sharedWith?: string[];
  },
): ModuleDecl {
  if (path.length === 0) {
    throw new Error('Module path must not be empty');
  }

  const { feature } = opts ?? {};
  const sharedWith = opts?.sharedWith;
  let visibility = opts?.visibility;

  if (sharedWith !== undefined) {
    if (visibility !== undefined && visibility !== 'shared') {
      throw new Error(
        `Module "${path}" provides sharedWith but visibility is "${visibility}"; visibility must be "shared"`,
      );
    }
    visibility = 'shared';
  }

  if (visibility === undefined) {
    visibility = feature !== undefined ? 'private' : 'public';
  }

  if (visibility === 'shared') {
    if (!sharedWith || sharedWith.length === 0) {
      throw new Error(
        `Module "${path}" has visibility "shared" but no sharedWith feature names`,
      );
    }
  }

  const decl: ModuleDecl = { path, visibility };
  if (feature !== undefined) {
    return { ...decl, feature, ...(sharedWith ? { sharedWith } : {}) };
  }
  return sharedWith ? { ...decl, sharedWith } : decl;
}
