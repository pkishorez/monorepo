import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';
import { Snapshot } from 'std-toolkit/snapshot';

const approved = ESchema.make('Ticket', {
  subject: Schema.String,
}).build();

export const snapshotGuard = Story.make({
  title: 'Snapshot guard',
  description:
    'An approved snapshot separates a safe change from a breaking one.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does the diff describe a correct change?', {
      answer:
        'It reports the change as safe. Adding the next version does not affect the approved versions.',
      proof: Effect.gen(function* () {
        const evolved = ESchema.make('Ticket', {
          subject: Schema.String,
        })
          .evolve('v2', { priority: Schema.Number }, (previous) => ({
            ...previous,
            priority: 3,
          }))
          .build();
        const changes = Snapshot.diff(
          Snapshot.capture(approved),
          Snapshot.capture(evolved),
        );
        yield* Story.assert(
          'appending v2 is classified safe',
          changes.length > 0 &&
            changes.every((change) => change.impact === 'safe'),
        );
        return changes;
      }),
    }),
    Story.question(
      'How does the diff describe an edit to a version that is already approved?',
      {
        answer:
          'It reports the change as breaking. A build can then fail before the change ships.',
        proof: Effect.gen(function* () {
          const editedInPlace = ESchema.make('Ticket', {
            subject: Schema.String,
            priority: Schema.Number,
          }).build();
          const changes = Snapshot.diff(
            Snapshot.capture(approved),
            Snapshot.capture(editedInPlace),
          );
          yield* Story.assert(
            'editing approved v1 is classified breaking',
            changes.some((change) => change.impact === 'breaking'),
          );
          return changes;
        }),
      },
    ),
  ],
});
