import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { EntityESchema, ESchema } from '@kstackz/std-toolkit/eschema';
import { TableSnapshot } from '@kstackz/std-toolkit/snapshot';

const Address = ESchema.make('Address', { city: Schema.String }).build();
const Person = EntityESchema.make('Person', 'personId', {
  name: Schema.String,
  address: Address.schema,
}).build();

const table = StdTable.make('people').primary('pk', 'sk').build();
table.entity(Person).primary().build();

export default Proof.make({
  title: 'A hand-edited snapshot that points at a missing schema is refused',
  description:
    'Parsing checks the document as a whole: a hand-edited file with a dangling reference never becomes a baseline.',
  prepare: Effect.gen(function* () {
    const serialized = yield* TableSnapshot.serialize(
      TableSnapshot.capture(table),
    );
    const document = JSON.parse(JSON.stringify(serialized)) as {
      schemas: { identity: string }[];
    };
    yield* Proof.assert(
      'the document holds Person and the Address it references',
      document.schemas
        .map(({ identity }) => identity)
        .sort()
        .join() === 'Address,Person',
    );
    return { document };
  }),
  act: ({ document }) =>
    Effect.gen(function* () {
      // Someone deletes Address from the file by hand.
      const edited = {
        ...document,
        schemas: document.schemas.filter(
          ({ identity }) => identity !== 'Address',
        ),
      };
      const parsed = yield* TableSnapshot.parse(edited).pipe(
        Effect.match({
          onFailure: (error) => ({ refused: true, message: error.message }),
          onSuccess: () => ({ refused: false, message: null }),
        }),
      );
      return parsed;
    }),
  verify: ({ refused, message }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the document is refused', refused);
      yield* Proof.assert(
        'the refusal names the dangling reference',
        message?.includes('Address') === true,
      );
    }),
});
