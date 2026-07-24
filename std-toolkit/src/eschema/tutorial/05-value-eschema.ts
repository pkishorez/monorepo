/**
 * Lesson 5 — Value evolving schemas (whole-value evolution)
 *
 * Everything so far evolved a *field map* by delta. But sometimes the thing you
 * want to version is not an object with fields — it's a single value: an enum,
 * a scalar, a union. For that there is `ValueESchema`.
 *
 * The difference:
 *   - ESchema      evolves by DELTA   (add/remove/replace named fields)
 *   - ValueESchema replaces the WHOLE value schema at each version, and the
 *     migration receives and returns the decoded value itself, not a field map.
 *
 * Because a bare value (say the string "draft") has nowhere to hang a `_v`,
 * ValueESchema wraps it in a *value envelope* on encode: `{ _v, value }`.
 *
 * Run it:  npx tsx src/tutorial/05-value-eschema.ts
 */
import { Effect, Schema } from 'effect';
import { ValueESchema } from '../index.js';

// A status enum. v1 has two states; v2 adds 'review' in the middle.
const Status = ValueESchema.make(
  'Status',
  Schema.Literals(['draft', 'published']),
)
  .evolve(
    'v2',
    Schema.Literals(['draft', 'review', 'published']),
    // The migration gets the decoded value and returns the next value. Here the
    // old states are still valid, so it passes them through unchanged.
    (value) => value,
  )
  .build();

// encode wraps the value in an envelope and stamps the latest version.
const encoded = Effect.runSync(Status.encode('review'));
console.log('encoded value:', encoded);
// => { _v: 'v2', value: 'review' }

// decode unwraps the envelope and folds forward.
console.log(
  'decode envelope:',
  Effect.runSync(Status.decode({ _v: 'v1', value: 'draft' })),
);
// => 'draft'

// --- Bare values: data from before you adopted the envelope ---------------
// A pre-adoption value has no envelope at all — just the raw value. eschema
// treats a bare value as earliest-version (v1) data, exactly like an unstamped
// row in lesson 3.
console.log('bare legacy value:', Effect.runSync(Status.decode('draft')));
// => 'draft'

// Migrations can also TRANSFORM the value's type across versions. Here v1 is a
// string and v2 is a number; the migration converts.
const Quantity = ValueESchema.make('Quantity', Schema.String)
  .evolve('v2', Schema.Number, (value) => Number(value))
  .build();

console.log('value type migration:', Effect.runSync(Quantity.decode('42')));
// => 42

// Rule of thumb: reach for ValueESchema when the unit of change is a single
// value (enum/scalar/union). Reach for ESchema when it's an object of fields.
