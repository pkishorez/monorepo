/**
 * Lesson 2 — Evolving: adding fields over time
 *
 * This is the reason the package exists. Your schema needs a new field, but you
 * already have data persisted under the old shape. With `.evolve` you describe
 * *what changed* and *how to fill in the gap* for old rows. eschema replays
 * those steps on read, so old data is upgraded automatically.
 *
 * Two things to internalise:
 *   1. `.evolve` takes a DELTA — only the fields that changed, not the whole
 *      map. eschema merges the delta onto the previous version for you.
 *   2. The migration is a pure function `(prev) => next`. It only has to handle
 *      the *immediately previous* version. eschema chains them: v1 -> v2 -> v3.
 *
 * Run it:  npx tsx src/tutorial/02-evolving-fields.ts
 */
import { Effect, Schema } from 'effect';
import { ESchema } from '../index.js';

const User = ESchema.make('User', {
  name: Schema.String,
})
  // v2 adds `email`. Old rows had no email, so the migration supplies one.
  .evolve('v2', { email: Schema.String }, (prev) => ({
    ...prev,
    email: 'unknown@example.com',
  }))
  // v3 adds `verified`. This migration only sees a v2 value (name + email).
  .evolve('v3', { verified: Schema.Boolean }, (prev) => ({
    ...prev,
    verified: false,
  }))
  .build();

// A row written way back at v1 — only a name.
const oldRow = { _v: 'v1', name: 'Bob' };

// decode walks v1 -> v2 -> v3, running each migration in order.
const decoded = Effect.runSync(User.decode(oldRow));
console.log('migrated v1 row:', decoded);
// => { name: 'Bob', email: 'unknown@example.com', verified: false }

// encode always writes the LATEST version. There is no way to encode an old
// version — old shapes only exist to be read, never written.
const encoded = Effect.runSync(
  User.encode({ name: 'Carol', email: 'c@x.com', verified: true }),
);
console.log('freshly encoded:', encoded);
// => { name: 'Carol', email: 'c@x.com', verified: true, _v: 'v3' }

// Versions must advance one step at a time: v1 -> v2 -> v3. You cannot skip to
// 'v5', and the migration's `prev` is always typed as the previous version's
// shape — so TypeScript catches a migration that forgets a field.
