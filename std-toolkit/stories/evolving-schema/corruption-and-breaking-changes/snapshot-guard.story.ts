import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';
import { Snapshot } from 'std-toolkit/snapshot';

const approved = ESchema.make('Ticket', {
  subject: Schema.String,
}).build();

export const snapshotGuard = Story.make({
  title: 'Snapshot guard',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does the snapshot diff classify an honest evolution?', {
      answer:
        'Appending the next version diffs as `safe` against the approved snapshot.',
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
      'How does the snapshot diff classify an in-place edit of an approved version?',
      {
        answer:
          "Editing an approved version's shape diffs as `breaking`, so CI can fail the build before it ships.",
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
