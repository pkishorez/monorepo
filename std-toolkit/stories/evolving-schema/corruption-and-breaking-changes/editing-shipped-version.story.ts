import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const shipped = ESchema.make('Event', {
  name: Schema.String,
}).build();

export const editingShippedVersion = Story.make({
  title: 'Editing shipped version',
  description:
    'If you edit a version that has shipped, the notes written under it stop working.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to rows that were written before v1 was edited?',
      {
        answer:
          'They stop working, and nothing reports the change. The edited schema still calls itself v1, so old rows fail the check because they do not have the new field.',
        proof: Effect.gen(function* () {
          const edited = ESchema.make('Event', {
            name: Schema.String,
            kind: Schema.String,
          }).build();
          const row = yield* shipped.encode({ name: 'deploy' });
          yield* Story.assert('the row was stored as v1', row._v === 'v1');
          const broken = yield* Effect.flip(edited.decode(row));
          yield* Story.assert(
            'the pre-edit row no longer decodes',
            broken instanceof ESchemaError &&
              broken.message === 'Decode failed',
          );
          return broken;
        }),
      },
    ),
    Story.question('Do rows written after the edit still work?', {
      answer:
        'Yes. New rows match the new v1 shape. That is what hides the fault during development.',
      proof: Effect.gen(function* () {
        const edited = ESchema.make('Event', {
          name: Schema.String,
          kind: Schema.String,
        }).build();
        const fresh = yield* edited.decode({
          _v: 'v1',
          name: 'deploy',
          kind: 'ci',
        });
        yield* Story.assert(
          'post-edit rows work — hiding the breakage',
          fresh.kind === 'ci',
        );
        return fresh;
      }),
    }),
  ],
});
