import { Effect, Fiber, Schema, Stream } from 'effect';
import { Story } from 'laymos/story';
import { defaultBroadcaster } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { agree, parity } from '../../support.js';

const beforeTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const afterTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const noteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  status: Schema.String,
}).build();

const noteBeforeIndex = beforeTable
  .entity(noteSchema)
  .primary({ pk: ['notebook'] })
  .build();

const noteAfterIndex = afterTable
  .entity(noteSchema)
  .primary({ pk: ['notebook'] })
  .index('GSI1', 'byStatus', { pk: ['notebook'], sk: ['status'] })
  .build();

export const backfillingAnIndex = Story.make({
  title: 'Backfilling an index',
  description:
    'A row written before an access pattern existed cannot answer it until scan, drift, and reindex bring it forward.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'An old row predates a new access pattern. Does it show up as needing repair, and does repairing it leave `_u` and subscribers alone?',
      {
        answer:
          'drift() compares the keys a row was stored with against what the current registration would derive, and flags the mismatch. reindex() writes the corrected keys back under the exact `_u` it read — no new version, no Change Notice — so a second drift() call reports the row clean, and a subscriber only ever hears about the next real write.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* noteBeforeIndex.insert({
                noteId: 'a1',
                notebook: 'news',
                title: 'Tides',
                status: 'open',
              });
              const heard = yield* Effect.forkChild(
                Stream.runCollect(afterTable.subscribe().pipe(Stream.take(1))),
              );
              yield* Effect.sleep('20 millis');
              const scanned = Array.from(
                yield* Stream.runCollect(afterTable.scan()),
              );
              const stored = scanned[0];
              if (stored === undefined)
                return yield* Effect.die(new Error('row missing from scan'));
              const beforeRepair = yield* afterTable.drift(stored);
              yield* afterTable.reindex(beforeRepair.currentForm);
              const rescanned = Array.from(
                yield* Stream.runCollect(afterTable.scan()),
              );
              const repaired = rescanned[0];
              if (repaired === undefined)
                return yield* Effect.die(
                  new Error('row missing after reindex'),
                );
              const afterRepair = yield* afterTable.drift(repaired);
              yield* noteAfterIndex.insert({
                noteId: 'a2',
                notebook: 'news',
                title: 'Storms',
                status: 'open',
              });
              const [notice] = yield* Fiber.join(heard);
              return {
                driftedBeforeRepair: beforeRepair.drifted,
                driftedAfterRepair: afterRepair.drifted,
                sameU: repaired.meta._u === stored.meta._u,
                firstNoticeWasTheFollowingWrite:
                  (notice?.value as { noteId?: string } | undefined)?.noteId ===
                  'a2',
              };
            }).pipe(Effect.provide(defaultBroadcaster)),
          );
          yield* Story.assert(
            'the row needed repair, then did not',
            results.sqlite.driftedBeforeRepair &&
              !results.sqlite.driftedAfterRepair,
          );
          yield* Story.assert(
            'the repair kept the same _u',
            results.sqlite.sameU,
          );
          yield* Story.assert(
            'no subscriber heard about the repair itself',
            results.sqlite.firstNoticeWasTheFollowingWrite,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question(
      'The row changes for real before the repair lands. What happens to the repair?',
      {
        answer:
          'reindex() guards on the `_u` it read. A real write in between moves `_u`, so the repair fails with ReindexConflict instead of silently overwriting the newer value.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* noteBeforeIndex.insert({
                noteId: 'b1',
                notebook: 'news',
                title: 'Tides',
                status: 'open',
              });
              const scanned = Array.from(
                yield* Stream.runCollect(afterTable.scan()),
              );
              const stored = scanned[0];
              if (stored === undefined)
                return yield* Effect.die(new Error('row missing from scan'));
              const { currentForm } = yield* afterTable.drift(stored);
              yield* noteAfterIndex.getAndUpdate(
                { noteId: 'b1', notebook: 'news' },
                { title: 'Tides (revised)' },
              );
              const outcome = yield* afterTable
                .reindex(currentForm)
                .pipe(Effect.result);
              return {
                failed: outcome._tag === 'Failure',
                reason:
                  outcome._tag === 'Failure'
                    ? outcome.failure.reason._tag
                    : null,
              };
            }),
          );
          yield* Story.assert(
            'the repair was refused, not silently applied',
            results.sqlite.failed &&
              results.sqlite.reason === 'ReindexConflict',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
