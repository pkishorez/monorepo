export function toDelayMap(
  delays: Record<string, unknown> | undefined,
): ReadonlyMap<string, number> {
  return new Map(
    Object.entries(delays ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}
