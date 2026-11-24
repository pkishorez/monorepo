import type { Options } from '@oxlint/plugins';

/** The strings listed at `key` in a rule's options, or none: `{ doors: ['logic/shared'] }`. */
export const stringsAt = (
  options: Readonly<Options>,
  key: string,
): readonly string[] => {
  const first = options[0];
  const value =
    first && typeof first === 'object' && !Array.isArray(first)
      ? first[key]
      : undefined;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
};
