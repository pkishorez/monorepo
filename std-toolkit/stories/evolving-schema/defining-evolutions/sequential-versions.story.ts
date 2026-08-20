import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

import { Note as sharedNote, sameShape } from '../support.js';

const Note = ESchema.make('Note', {
  body: Schema.String,
  colour: Schema.String,
})
  .evolve('v2', { pinned: Schema.Boolean }, (previous) => ({
    ...previous,
    pinned: false,
  }))
  .evolve('v3', { colour: null }, ({ colour: _colour, ...rest }) => rest)
  .evolve('v4', { body: null, text: Schema.String }, ({ body, ...rest }) => ({
    ...rest,
    text: body,
  }))
  .build();

export const sequentialVersions = Story.make({
  title: 'The whole ladder at once',
  description:
    'The three rungs, run end to end — and the proof that this is the Note every later Story uses.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The oldest note in the notebook has never been opened since it was written. What happens the first time someone reads it?',
      {
        answer:
          'Every migration between its version and the latest runs, in order, in one pass. It gains `pinned`, loses `colour`, and its words move from `body` to `text`.',
        proof: Story.trace(
          Effect.gen(function* () {
            const migrated = yield* Note.decode({
              _v: 'v1',
              body: 'Buy milk',
              colour: 'yellow',
            });
            yield* Story.assert(
              'the v1→v2 rung ran',
              migrated.pinned === false,
            );
            yield* Story.assert(
              'the v2→v3 rung ran after it',
              !('colour' in migrated),
            );
            yield* Story.assert(
              'the v3→v4 rung ran last',
              migrated.text === 'Buy milk' && !('body' in migrated),
            );
            return migrated;
          }),
        ),
      },
    ),
    Story.question('Which version does the Note call its latest?', {
      answer:
        'v4 — the last rung declared. That is the version every write is stamped with from now on.',
      proof: Effect.gen(function* () {
        yield* Story.assert(
          'the latest version is the last rung declared',
          Note.latestVersion === 'v4',
        );
        return { latestVersion: Note.latestVersion };
      }),
    }),
    Story.question(
      'Is the Note built across these Stories the same Note the rest of the Stories import?',
      {
        answer:
          'Yes, and this proves it rather than promising it: the ladder above and the `Note` in `support.ts` describe the same shape at the same version.',
        proof: Effect.gen(function* () {
          const built = Note.getDescriptor();
          const shared = sharedNote.getDescriptor();
          yield* Story.assert(
            'both ladders end at the same version',
            Note.latestVersion === sharedNote.latestVersion,
          );
          yield* Story.assert(
            'both ladders describe the same shape',
            sameShape(built, shared),
          );
          return { latestVersion: sharedNote.latestVersion };
        }),
      },
    ),
  ],
});
