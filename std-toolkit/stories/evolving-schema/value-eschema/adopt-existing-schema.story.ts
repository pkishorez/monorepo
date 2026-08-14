import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ValueESchema } from 'std-toolkit/eschema';

const Status = Schema.Literals(['active', 'archived']);

const StatusV = ValueESchema.make('Status', Status).build();

export const adoptExistingSchema = Story.make({
  title: 'Adopt existing schema',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to values stored before the schema became a ValueESchema?',
      {
        answer:
          'They decode unchanged — the existing schema becomes v1, and bare unstamped values are read as earliest-version data.',
        proof: Effect.gen(function* () {
          const legacy = yield* StatusV.decode('active');
          yield* Story.assert(
            'the pre-eschema value decodes as-is',
            legacy === 'active',
          );
          return legacy;
        }),
      },
    ),
    Story.question('What does encode write once the schema is adopted?', {
      answer:
        'A stamped `{ _v, value }` envelope — new writes carry a version while old bare values stay readable.',
      proof: Effect.gen(function* () {
        const encoded = yield* StatusV.encode('archived');
        yield* Story.assert(
          'new writes are stamped at v1',
          encoded._v === 'v1' && encoded.value === 'archived',
        );
        return encoded;
      }),
    }),
    Story.question(
      'What happens to the old bare values when the adopted schema later evolves?',
      {
        answer:
          'They fold forward from v1 like any other row, so adoption costs nothing now and buys migrations later.',
        proof: Effect.gen(function* () {
          const Evolved = ValueESchema.make('Status', Status)
            .evolve(
              'v2',
              Schema.Literals(['ACTIVE', 'ARCHIVED']),
              (previous) => (previous === 'active' ? 'ACTIVE' : 'ARCHIVED'),
            )
            .build();
          const migrated = yield* Evolved.decode('active');
          yield* Story.assert(
            'the bare legacy value reaches the latest shape',
            migrated === 'ACTIVE',
          );
          return migrated;
        }),
      },
    ),
  ],
});
