/**
 * Lesson 4 — Transforms, removing fields, and renaming
 *
 * `.evolve` can do more than add fields. Three common shape changes:
 *
 *   - TRANSFORM a field's stored type (e.g. stored as string, used as number)
 *   - REMOVE a field            -> pass `null` for that key in the delta
 *   - RENAME a field            -> remove the old key + add the new one, and let
 *                                  the migration copy the value across
 *
 * Run it:  npx tsx src/tutorial/04-transform-rename-remove.ts
 */
import { Effect, Schema, SchemaTransformation } from 'effect';
import { ESchema } from '../index.js';

// --- Transform: stored type differs from the in-memory type ---------------
// A field can be an Effect Schema transformation. Here the wire value is a
// string, but your code works with a number. encode/decode convert both ways.
const StringToNumber = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (s) => parseInt(s, 10),
      encode: (n) => String(n),
    }),
  ),
);

const Counter = ESchema.make({ count: StringToNumber }).build();
console.log(
  'decode "42":',
  Effect.runSync(Counter.decode({ _v: 'v1', count: '42' })),
);
// => { count: 42 }
console.log('encode 42:', Effect.runSync(Counter.encode({ count: 42 })));
// => { count: '42', _v: 'v1' }

// --- Remove a field: `null` in the delta ----------------------------------
// v2 drops `nickname`. The migration returns the next shape WITHOUT it.
const Account = ESchema.make({
  id: Schema.String,
  nickname: Schema.String,
})
  .evolve('v2', { nickname: null }, (prev) => ({ id: prev.id }))
  .build();

console.log(
  'removed field:',
  Effect.runSync(Account.decode({ _v: 'v1', id: 'a1', nickname: 'bob' })),
);
// => { id: 'a1' }

// --- Rename a field: remove old + add new in one step ---------------------
// There is no dedicated "rename" — express it as remove + add, and copy the
// value across in the migration. Here `firstName`/`lastName` become `fullName`.
const Person = ESchema.make({
  firstName: Schema.String,
  lastName: Schema.String,
})
  .evolve(
    'v2',
    { firstName: null, lastName: null, fullName: Schema.String },
    (prev) => ({ fullName: `${prev.firstName} ${prev.lastName}` }),
  )
  .build();

console.log(
  'renamed:',
  Effect.runSync(
    Person.decode({ _v: 'v1', firstName: 'Ada', lastName: 'Lovelace' }),
  ),
);
// => { fullName: 'Ada Lovelace' }
