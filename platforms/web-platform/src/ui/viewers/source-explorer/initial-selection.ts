// Opens on the requested file, else the first changed file, else the entry
// point, else the first file in path order.
export function initialSourceFile(
  files: readonly { readonly path: string }[],
  entryPoint?: string,
  requestedPath?: string,
  changedPaths?: ReadonlyMap<string, unknown>,
): string | undefined {
  const paths = files
    .map(({ path }) => path)
    .sort((left, right) => left.localeCompare(right));
  if (requestedPath !== undefined && paths.includes(requestedPath)) {
    return requestedPath;
  }
  const firstChanged = paths.find((path) => changedPaths?.has(path));
  if (firstChanged !== undefined) return firstChanged;
  if (entryPoint !== undefined && paths.includes(entryPoint)) {
    return entryPoint;
  }
  return paths[0];
}
