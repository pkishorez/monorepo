import { Schema, Stream } from 'effect';
import type { Entity } from '../../core/index.js';
import { make, type SyncStrategy } from './definition.js';
import { readForward, type ForwardOptions } from './forward.js';

export type OldToNewState<TItem> = { readonly cursor: Entity<TItem> | null };

/**
 * Reads the Backend from the oldest change forward and saves the newest
 * settled Entity as its cursor.
 */
export const oldToNew = <TItem, R = never>(
  options: ForwardOptions<TItem, R>,
): SyncStrategy<TItem, OldToNewState<TItem>, R> =>
  make<TItem, OldToNewState<TItem>, R>({
    name: 'old-to-new',
    state: (entity) =>
      Schema.Struct({
        cursor: Schema.NullOr(entity),
      }) as unknown as Schema.Codec<OldToNewState<TItem>, unknown>,
    initial: { cursor: null },
    run: ({ state, settledCursor }) => {
      let saved = state.cursor;
      return readForward(options, () => saved).pipe(
        Stream.map((batch) => {
          const settled = settledCursor(batch);
          if (settled && (saved === null || settled.meta._u > saved.meta._u))
            saved = settled;
          return { entities: batch, state: { cursor: saved } };
        }),
      );
    },
  });
