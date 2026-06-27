/**
 * Lesson 6 — Composition: nesting evolving schemas
 *
 * Real data is nested. An evolving schema can be embedded as a field of another
 * evolving schema using `toSchema`, which turns it into a native Effect Schema
 * you can drop anywhere a schema is expected — including inside `Schema.Array`.
 *
 * The key idea: each nested schema decodes through its OWN version chain,
 * independently of the parent. The parent carries its `_v`; each child carries
 * its own `_v`. They version separately.
 *
 * This lesson also switches to the idiomatic Effect style — staying inside
 * `Effect.gen` and `yield*`ing, instead of `runSync` on every line.
 *
 * Run it:  npx tsx src/tutorial/06-composition.ts
 */
import { Effect, Schema } from 'effect';
import { ESchema, ValueESchema, toSchema } from '../index.js';

// A nested object-shaped schema.
const Address = ESchema.make({
  street: Schema.String,
  city: Schema.String,
}).build();

// A nested value schema (lesson 5) — composes just as well.
const Status = ValueESchema.make(Schema.Literals(['draft', 'published']))
  .evolve('v2', Schema.Literals(['draft', 'review', 'published']), (v) => v)
  .build();

// The parent embeds both children via `toSchema`, including an array of them.
const Ticket = ESchema.make({
  title: Schema.String,
  status: toSchema(Status, { name: 'Status' }),
  addresses: Schema.Array(toSchema(Address, { name: 'Address' })),
}).build();

Effect.runSync(
  Effect.gen(function* () {
    const encoded = yield* Ticket.encode({
      title: 'Fix billing',
      status: 'review',
      addresses: [{ street: '123 Main', city: 'NYC' }],
    });

    // Notice every level got its own `_v`: the parent, the value envelope for
    // status, and each address in the array.
    console.log('nested encode:', JSON.stringify(encoded, null, 2));
    // status -> { _v: 'v2', value: 'review' }
    // addresses[0] -> { _v: 'v1', street: '123 Main', city: 'NYC' }

    const decoded = yield* Ticket.decode(encoded);
    console.log('nested decode:', decoded);
    // => { title, status: 'review', addresses: [{ street, city }] }

    // A nested child can be a BARE legacy value (lesson 3 + 5), and it still
    // decodes correctly through the child's own chain — here a bare 'draft'.
    const legacy = yield* Ticket.decode({
      _v: 'v1',
      title: 'Old ticket',
      status: 'draft',
      addresses: [{ street: '1 First', city: 'LA' }],
    });
    console.log('nested legacy decode:', legacy.status); // => 'draft'
  }),
);

// Each array element may even be stamped at a DIFFERENT version, and they all
// fold forward independently. Versioning is per-schema, per-instance.
