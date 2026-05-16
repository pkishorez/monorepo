import { Effect } from 'effect';

export const getSnippetMap = (
  effectMap: Record<string, unknown>,
  codeMap: Record<string, unknown>,
): Record<string, { effect: Effect.Effect<unknown>; code: string }> =>
  Object.fromEntries(
    Object.keys(effectMap).map((key) => {
      const updatedKey = key.replace(/^\.\//, '').replace(/\.ts$/, '');
      return [
        updatedKey,
        {
          effect: effectMap[key] as Effect.Effect<unknown>,
          code: codeMap[key] as string,
        },
      ] as const;
    }),
  );
