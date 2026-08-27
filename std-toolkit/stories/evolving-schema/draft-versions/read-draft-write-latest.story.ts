import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';
import { Snapshot } from 'std-toolkit/snapshot';

const published = ESchema.make('Ticket', {
  subject: Schema.String,
}).build();

const withDraft = ESchema.make('Ticket', {
  subject: Schema.String,
})
  .draft(
    { subject: Schema.String, priority: Schema.Number },
    {
      forward: (previous) => ({ ...previous, priority: 0 }),
      backward: (draft) => ({ subject: draft.subject }),
    },
  )
  .build();

export const readDraftWriteLatest = Story.make({
  title: 'Read the draft, write the latest',
  description:
    'A draft changes what the application sees, never what the table stores.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What shape does decode hand back once a draft exists?', {
      answer:
        "The draft shape — every published field, plus whatever the draft adds, produced by the draft's forward migration.",
      proof: Effect.gen(function* () {
        const decoded = yield* withDraft.decode({
          _v: 'v1',
          subject: 'Printer on fire',
        });
        yield* Story.assert(
          'the draft field is present',
          decoded.priority === 0 && decoded.subject === 'Printer on fire',
        );
        return decoded;
      }),
    }),
    Story.question(
      'What actually gets written when the app encodes a draft value?',
      {
        answer:
          'Bytes in the last published shape, stamped with the last published version — never a draft-specific tag, because a draft never has a version of its own.',
        proof: Effect.gen(function* () {
          const encoded = yield* withDraft.encode({
            subject: 'Printer on fire',
            priority: 5,
          });
          yield* Story.assert(
            'the encoded value has no draft field and is stamped v1',
            encoded._v === 'v1' &&
              !('priority' in encoded) &&
              encoded.subject === 'Printer on fire',
          );
          return encoded;
        }),
      },
    ),
    Story.question(
      'Does a Snapshot taken while a draft exists look any different from one taken before it?',
      {
        answer:
          'No. Capture only ever sees published `.evolve()` versions, so the draft is completely invisible to it.',
        proof: Effect.gen(function* () {
          const before = Snapshot.capture(published);
          const after = Snapshot.capture(withDraft);
          yield* Story.assert(
            'the captured snapshot is unchanged',
            Snapshot.diff(before, after).length === 0,
          );
          return { before, after };
        }),
      },
    ),
  ],
});
