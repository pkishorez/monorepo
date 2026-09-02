import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

// The v4 history from chapter 18, plus a draft: `dueDate` is tried on top of the newest version without becoming a version. `forward` fills it in on the way out of storage, `backward` strips it on the way in.
export const TaskTryingDueDate = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
  assignee: Schema.NullOr(Schema.String),
  colour: Schema.String,
  notes: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve('v3', { colour: null }, ({ colour: _colour, ...v2 }) => v2)
  .evolve(
    'v4',
    { notes: null, details: Schema.String },
    ({ notes, ...v3 }) => ({
      ...v3,
      details: notes,
    }),
  )
  .draft(
    { dueDate: Schema.NullOr(Schema.String) },
    {
      forward: (v4) => ({ ...v4, dueDate: null }),
      backward: ({ dueDate: _dueDate, ...v4 }) => v4,
    },
  )
  .build();

// The same history once the team commits: the draft becomes v5 by a plain source edit. Its delta and `forward` step are kept word for word, and `backward` is dropped because writes now land at v5 directly.
const TaskV5 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
  assignee: Schema.NullOr(Schema.String),
  colour: Schema.String,
  notes: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve('v3', { colour: null }, ({ colour: _colour, ...v2 }) => v2)
  .evolve(
    'v4',
    { notes: null, details: Schema.String },
    ({ notes, ...v3 }) => ({
      ...v3,
      details: notes,
    }),
  )
  .evolve('v5', { dueDate: Schema.NullOr(Schema.String) }, (v4) => ({
    ...v4,
    dueDate: null,
  }))
  .build();

// A task as it sits in storage today, at v4.
const storedToday = {
  _v: 'v4',
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: 'ana',
  priority: 'high',
  details: 'Ask Ana first',
} as const;

export const tryingANewFieldBeforeCommittingToIt = Story.make({
  title: 'Trying a new field before committing to it',
  description:
    'A due date is tried as a draft: the app sees it, storage never does, and promoting it later is a source edit.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'While the due date is only a draft, what does a read hand back?',
      {
        answer:
          "The draft shape: every field of the newest version plus `dueDate`, filled in by the draft's `forward` step. A draft (a trial shape laid over the newest version, never stored) changes what the app sees, not what the table holds.",
        proof: Story.trace(
          Effect.gen(function* () {
            // Read a v4 row through the drafted shape; the draft field is there.
            const seen = yield* TaskTryingDueDate.decode(storedToday);
            yield* Story.assert(
              'the app sees the draft field',
              seen.dueDate === null && seen.details === 'Ask Ana first',
            );
            yield* Story.assert(
              'the newest version is still v4; the draft is not one',
              TaskTryingDueDate.latestVersion === 'v4',
            );
            return { seen, latestVersion: TaskTryingDueDate.latestVersion };
          }),
        ),
      },
    ),
    Story.question('What is actually written while the draft is in place?', {
      answer:
        'A v4 row with no `dueDate` in it: the `backward` step strips the draft field, and the row is stamped with the last real version. Whatever due date the app set is not kept, which is the price of trying before committing.',
      proof: Story.trace(
        Effect.gen(function* () {
          // Save a task the app has given a due date; storage gets v4 without it.
          const written = yield* TaskTryingDueDate.encode({
            taskId: 't1',
            boardId: 'work',
            title: 'Write the plan',
            status: 'open',
            assignee: 'ana',
            priority: 'high',
            details: 'Ask Ana first',
            dueDate: '2026-09-30',
          });
          yield* Story.assert(
            'the row is stamped with the last real version',
            written._v === 'v4',
          );
          yield* Story.assert(
            'the draft field never reaches storage',
            !('dueDate' in written),
          );
          return { written };
        }),
      ),
    }),
    Story.question(
      'The team commits and the draft becomes v5. What happens to rows written during the draft?',
      {
        answer:
          "They are ordinary v4 rows, so the promoted shape reads them through the v4 to v5 step and they get the step's default, `null`, never the due date that was in memory before it was stripped. New saves now land at v5 with the due date kept.",
        proof: Story.trace(
          Effect.gen(function* () {
            // A row saved while the field was a draft: v4, no due date.
            const writtenAsDraft = yield* TaskTryingDueDate.encode({
              taskId: 't1',
              boardId: 'work',
              title: 'Write the plan',
              status: 'open',
              assignee: 'ana',
              priority: 'high',
              details: 'Ask Ana first',
              dueDate: '2026-09-30',
            });
            // The promoted shape reads it like any v4 row.
            const seen = yield* TaskV5.decode(writtenAsDraft);
            // A fresh save through the promoted shape keeps the due date.
            const written = yield* TaskV5.encode({
              ...seen,
              dueDate: '2026-09-30',
            });
            yield* Story.assert(
              'the draft-era row gets the step default, not the lost value',
              seen.dueDate === null,
            );
            yield* Story.assert(
              'new saves land at v5 with the field kept',
              written._v === 'v5' && written.dueDate === '2026-09-30',
            );
            return { writtenAsDraft, seen, written };
          }),
        ),
      },
    ),
  ],
});
