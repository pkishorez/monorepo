import { Effect, Logger, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { EntityESchema } from 'std-toolkit/eschema';

const logicalName = 'enforcement-stories';

const beforeTable = StdTable.make(logicalName).primary('pk', 'sk').build();
const afterTable = StdTable.make(logicalName)
  .primary('partitionKey', 'sortKey')
  .build();

// A purely additive, safe change: a second entity joins the table.
const noteSchema = EntityESchema.make('Note', 'noteId', {
  title: Schema.String,
}).build();
const taskSchema = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();

const safeBeforeTable = StdTable.make(logicalName).primary('pk', 'sk').build();
safeBeforeTable
  .entity(noteSchema)
  .primary({ pk: ['title'] })
  .build();

const safeAfterTable = StdTable.make(logicalName).primary('pk', 'sk').build();
safeAfterTable
  .entity(noteSchema)
  .primary({ pk: ['title'] })
  .build();
safeAfterTable
  .entity(taskSchema)
  .primary({ pk: ['title'] })
  .build();

// A requires-backfill change: an existing entity gains a GSI access pattern.
// The rows already in the table cannot answer it until something backfills
// them — that's the operator's job, not a reason to fail the deploy.
const backfillBeforeTable = StdTable.make(logicalName)
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
backfillBeforeTable
  .entity(noteSchema)
  .primary({ pk: ['title'] })
  .build();

const backfillAfterTable = StdTable.make(logicalName)
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
backfillAfterTable
  .entity(noteSchema)
  .primary({ pk: ['title'] })
  .index('GSI1', 'byTitle', { pk: ['title'] })
  .build();

export const verifySnapshot = Story.make({
  title: 'A table that guards its own shape',
  description:
    'table.verifySnapshot() keeps its baseline inside the table itself — a deploy step, not a file a developer has to remember to update.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The very first deploy has nothing to compare against. What happens?',
      {
        answer:
          'It bootstraps: the current shape is written as the baseline, with nothing to reject. A second call against the unchanged shape then simply matches.',
        proof: Effect.gen(function* () {
          const memory = Memory.make(beforeTable);
          const outcome = yield* Effect.gen(function* () {
            yield* beforeTable.verifySnapshot();
            const second = yield* beforeTable
              .verifySnapshot()
              .pipe(Effect.result);
            return second._tag;
          }).pipe(Effect.provide(memory.layer));
          yield* Story.assert(
            'the second call also succeeds',
            outcome === 'Success',
          );
          return outcome;
        }),
      },
    ),
    Story.question(
      "A later deploy changes the table's primary key derivation — a real breaking change. What happens?",
      {
        answer:
          'It rejects, and the stored baseline is left untouched. The deploy fails before a table that already has data ever accepts a shape its rows cannot decode.',
        proof: Effect.gen(function* () {
          const memory = Memory.make(beforeTable);
          const layer = memory.layer;
          const result = yield* Effect.gen(function* () {
            yield* beforeTable.verifySnapshot();
            const rejected = yield* afterTable
              .verifySnapshot()
              .pipe(Effect.result);
            // The baseline is still "before": verifying it again must still match.
            const stillMatches = yield* beforeTable
              .verifySnapshot()
              .pipe(Effect.result);
            return {
              rejected: rejected._tag === 'Failure',
              reason:
                rejected._tag === 'Failure'
                  ? (rejected.failure as { _tag?: string })._tag
                  : undefined,
              baselineUntouched: stillMatches._tag === 'Success',
            };
          }).pipe(Effect.provide(layer));
          yield* Story.assert(
            'the breaking change was rejected',
            result.rejected,
          );
          yield* Story.assert(
            'it rejected with SnapshotIncompatible',
            result.reason === 'SnapshotIncompatible',
          );
          yield* Story.assert(
            'the baseline never moved',
            result.baselineUntouched,
          );
          return result;
        }),
      },
    ),
    Story.question(
      'A later deploy just adds a new entity — a purely additive, safe change. Does the baseline actually move to include it?',
      {
        answer:
          "Yes, immediately, no warning needed. Proof of that isn't a claim about what happened internally — it's that reverting to the old, narrower table definition afterward is now rejected: the baseline expects Task, and the old definition doesn't have it.",
        proof: Effect.gen(function* () {
          const memory = Memory.make(safeBeforeTable);
          const layer = memory.layer;
          const result = yield* Effect.gen(function* () {
            yield* safeBeforeTable.verifySnapshot();
            yield* safeAfterTable.verifySnapshot();
            const revert = yield* safeBeforeTable
              .verifySnapshot()
              .pipe(Effect.result);
            return {
              revertRejected: revert._tag === 'Failure',
              reason:
                revert._tag === 'Failure'
                  ? (revert.failure as { _tag?: string })._tag
                  : undefined,
            };
          }).pipe(Effect.provide(layer));
          yield* Story.assert(
            'the old definition is rejected now that the baseline has moved past it',
            result.revertRejected && result.reason === 'SnapshotIncompatible',
          );
          return result;
        }),
      },
    ),
    Story.question(
      'A later deploy edits an index — a real structural change, but one only the index itself needs to catch up on, not the rows already stored. What happens?',
      {
        answer:
          'It does not reject, and the deploy proceeds. A warning is logged naming the change, because backfilling the index afterward is the job `table.drift()`/`table.reindex()` already exist for — not a reason to fail the build.',
        proof: Effect.gen(function* () {
          const memory = Memory.make(backfillBeforeTable);
          const layer = memory.layer;
          const warnings: string[] = [];
          const collector = Logger.make<unknown, void>((options) => {
            if (options.logLevel === 'Warn') {
              warnings.push(
                Array.isArray(options.message)
                  ? options.message.map(String).join(' ')
                  : String(options.message),
              );
            }
          });
          const outcome = yield* Effect.gen(function* () {
            yield* backfillBeforeTable.verifySnapshot();
            const second = yield* backfillAfterTable
              .verifySnapshot()
              .pipe(Effect.result);
            return second._tag;
          }).pipe(
            Effect.provide(layer),
            Effect.provide(Logger.layer([collector])),
          );
          yield* Story.assert(
            'the requires-backfill change did not reject',
            outcome === 'Success',
          );
          yield* Story.assert(
            'a warning named the change that needs a backfill',
            warnings.some((message) => message.includes('backfill')),
          );
          return { outcome, warnings };
        }),
      },
    ),
  ],
});
