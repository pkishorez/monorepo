export function findCoverageViolations(
  files: Iterable<string>,
  membership: ReadonlyMap<string, string>,
): readonly string[] {
  return [...files]
    .filter((file) => !membership.has(file))
    .sort((left, right) => left.localeCompare(right));
}
