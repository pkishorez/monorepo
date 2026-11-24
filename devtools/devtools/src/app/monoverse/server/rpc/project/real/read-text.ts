import type { Snapshot } from '../../../services/snapshots/contract/index.js';

/** One file's text; undefined when there is no such file. */
export async function readText(
  snapshot: Snapshot,
  path: string,
): Promise<string | undefined> {
  const bytes = await snapshot.read(path);
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}

/** `path` inside `folder`, both root-relative, as one root-relative path. */
export function joinPath(folder: string, path: string): string {
  return folder === '' ? path : `${folder}/${path}`;
}
