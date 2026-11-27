import type { Snapshot } from '../../../services/snapshots/contract/index.js';

export async function readText(
  snapshot: Snapshot,
  path: string,
): Promise<string | undefined> {
  const bytes = await snapshot.read(path);
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}
