import type { ModuleSourceSnapshot } from 'laymos';

export function initialSourceFile(
  snapshot: ModuleSourceSnapshot,
  requestedPath?: string,
): string | undefined {
  const paths = snapshot.files.map(({ path }) => path);
  if (requestedPath !== undefined && paths.includes(requestedPath)) {
    return requestedPath;
  }
  if (
    snapshot.entryPoint !== undefined &&
    paths.includes(snapshot.entryPoint)
  ) {
    return snapshot.entryPoint;
  }
  return [...paths].sort((left, right) => left.localeCompare(right))[0];
}
