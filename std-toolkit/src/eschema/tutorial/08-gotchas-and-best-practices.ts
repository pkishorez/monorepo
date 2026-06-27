/**
 * Lesson 8 — Gotchas and best practices
 *
 * A checklist of the things that bite people, with runnable proof for each.
 *
 * Run it:  npx tsx src/tutorial/08-gotchas-and-best-practices.ts
 */
import { Effect, Schema } from 'effect';
import { ESchema } from '../index.js';

// --- 1. Prefer `Schema.NullOr` over `Schema.optional` ---------------------
// For an evolvable field, model "no value" as `null`, not as an absent key.
//
// Why: a migration is a TOTAL function `(prev) => next`. If a field is optional
// it may or may not be present in `prev`, so every migration that touches it has
// to branch on undefined, and the encoded shape becomes unstable (sometimes the
// key is there, sometimes not). With `NullOr` the field is ALWAYS present and
// always has a definite value — migrations stay total and the wire shape is
// predictable. Add a field as nullable, default it to `null` in the migration.
const Profile = ESchema.make({ name: Schema.String })
  .evolve('v2', { bio: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    bio: null, // explicit absence, not a missing key
  }))
  .build();

console.log(
  'nullable field:',
  Effect.runSync(Profile.decode({ _v: 'v1', name: 'Al' })),
);
// => { name: 'Al', bio: null }

// --- 2. Field names starting with `_` are reserved ------------------------
// `_v` (and any `_`-prefixed key) belongs to the library. The type system
// rejects them at `make`/`evolve`; this would not compile:
//   ESchema.make({ _internal: Schema.String })  // type error

// --- 3. v1 is forever. Never edit it once data exists ---------------------
// Unstamped legacy rows decode AS v1 (lesson 3). If you change v1's fields, you
// silently break every old row. Add a `.evolve` step instead — that's the whole
// point of the package.

// --- 4. Migrations run only on READ, only on older data -------------------
// encode always writes the latest version; migrations never run on encode. So a
// migration is the only place to backfill, and it must be a pure function — no
// IO, no clock, no randomness — because it may run on any read at any time.

// --- 5. Each migration handles ONLY the previous version ------------------
// eschema chains them (v1->v2->v3). Do not try to handle "any old version" in
// one migration; write one small step per version and let the chain compose.

// --- 6. Schemas are immutable after `.build()` ----------------------------
// Define every version before building. There is no way to append a version to
// a built schema — build returns a frozen instance.

// --- 7. Composition is not isolated (lesson 7) ----------------------------
// Evolving a nested schema changes what its parents decode to. When you evolve
// a child, audit the whole tree that embeds it, not just the child.

// --- 8. Don't touch `.fields` / `.schema` at module load time -------------
// Reading a schema's fields before module initialisation finishes throws a
// clear init error. Build schemas at module scope, but compute derived things
// lazily (inside functions), not in top-level expressions that race init.

console.log('see the comments in this file for the full checklist.');
