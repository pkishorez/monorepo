export function initialSourceFile(
  files: readonly { readonly path: string }[],
  entryPoint?: string,
  requestedPath?: string,
): string | undefined {
  const paths = files.map(({ path }) => path);
  if (requestedPath !== undefined && paths.includes(requestedPath)) {
    return requestedPath;
  }
  if (entryPoint !== undefined && paths.includes(entryPoint)) {
    return entryPoint;
  }
  return [...paths].sort((left, right) => left.localeCompare(right))[0];
}
