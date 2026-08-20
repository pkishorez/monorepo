import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema, ESchemaError } from 'std-toolkit/eschema';

const shipped = ESchema.make('Event', {
  name: Schema.String,
}).build();

export const editingShippedVersion = Story.make({
  title: 'Editing shipped version',
  description:
    'Editing a version that has already shipped breaks the rows written under it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to rows written before v1 is edited in place?',
      {
        answer:
          'They silently break — the edited schema still calls itself v1, so old rows fail with `Decode failed` because they lack the new field.',
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
    Story.question('Do rows written after the in-place edit still work?', {
      answer:
        'Yes — new rows match the new v1 shape, which is exactly what hides the breakage in development.',
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
