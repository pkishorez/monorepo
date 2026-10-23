import { keys } from '../../../keys.ts';

/*
 * Bindings as kept may no longer fit the keys definition: an Action gone,
 * keys that are no Shortcut, or a default added since that now Conflicts.
 * The Keys Provider throws on the first and, in development, on the last,
 * so what is read keeps only the Bindings that still fit.
 */

type Bindings = Readonly<Record<string, ReadonlyArray<string>>>;

/**
 * The Bindings that fit the definition: invalid ones, and each in a
 * Conflict, dropped, again until none is, since a dropped one's defaults
 * can Conflict with another's. Defaults never Conflict, so it ends.
 */
export const fitted = (bindings: Bindings): Bindings => {
  const check = keys.checkBindings(bindings);
  const dropped = new Set([
    ...check.invalid.map(({ id }) => id),
    ...check.conflicts.flatMap((conflict) =>
      [conflict.id, conflict.with].filter((id) => id in bindings),
    ),
  ]);
  const kept = Object.entries(bindings).filter(([id]) => !dropped.has(id));
  return kept.length === Object.keys(bindings).length
    ? bindings
    : fitted(Object.fromEntries(kept));
};
