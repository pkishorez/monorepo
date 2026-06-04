/**
 * Lesson 3 — Adopting eschema for data that already exists
 *
 * You usually don't start with eschema. You start with a plain Effect Schema
 * and a database full of rows. Then one day you want migrations. The question
 * that scares everyone: "what happens to all the rows that have no `_v` stamp?"
 *
 * The rule is deliberately simple and safe:
 *
 *   Unstamped data is decoded as the EARLIEST version (v1), not the latest.
 *
 * So adopting eschema is a non-breaking change. Wrap your existing Effect Schema
 * as the `v1` of an evolving schema, and every legacy row decodes as v1 and
 * folds forward through whatever migrations you add later.
 *
 * Run it:  npx tsx src/tutorial/03-adopting-existing-data.ts
 */
import { Effect, Schema } from 'effect';
import { ESchema } from '../index.js';

// --- Before eschema -------------------------------------------------------
// Your old code had a plain struct, and rows like this in the database.
// They have NO `_v` field, because nothing was stamping one.
const legacyRow = { name: 'Bob' };

// --- Step 1: wrap the existing shape as v1, change nothing else ------------
// On a single-version schema this is a pure no-op: stamped or unstamped, the
// data decodes identically. Safe to ship on its own.
const UserV1Only = ESchema.make({ name: Schema.String }).build();
console.log(
  'adopted, no evolution yet:',
  Effect.runSync(UserV1Only.decode(legacyRow)),
);
// => { name: 'Bob' }

// --- Step 2: later, evolve past v1 ----------------------------------------
// NOW the "unstamped = v1" rule earns its keep: the legacy row is treated as v1
// and folds forward through the email migration.
const User = ESchema.make({ name: Schema.String })
  .evolve('v2', { email: Schema.String }, (prev) => ({
    ...prev,
    email: 'unknown@example.com',
  }))
  .build();

console.log(
  'legacy row after evolving:',
  Effect.runSync(User.decode(legacyRow)),
);
// => { name: 'Bob', email: 'unknown@example.com' }

// --- The contract you must honour -----------------------------------------
// Your `v1` fields MUST match the shape your existing data was actually written
// with. eschema cannot detect a mismatch up front: if an unstamped row does not
// match v1, decode FAILS LOUDLY rather than silently guessing another version.
const wrongShape = { fullName: 'Bob' }; // never matched v1's `name`
const result = Effect.runSync(Effect.result(User.decode(wrongShape)));
console.log('mismatched legacy row fails:', result._tag); // => 'Failure'

// Takeaway: freeze v1 to mirror your real historical data, then only ever move
// forward with `.evolve`. Never edit v1 after data exists.
