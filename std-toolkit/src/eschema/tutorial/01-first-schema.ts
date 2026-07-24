/**
 * Lesson 1 — Your first evolving schema
 *
 * An *evolving schema* is an ordinary schema (a set of fields) that also
 * remembers its own version history. Today you only have one version, so it
 * behaves like a plain schema. The payoff comes later: when you change the
 * shape, old data still reads correctly. Start simple.
 *
 * Run it:  npx tsx src/tutorial/01-first-schema.ts
 */
import { Effect, Schema } from 'effect';
import { ESchema } from '../index.js';

// `make` takes a name and a field map. `build` freezes it into a usable schema.
// The name is the schema's identity; there is no version number to pass — the
// first version is always `v1`.
const User = ESchema.make('User', {
  name: Schema.String,
  email: Schema.String,
}).build();

// encode: your in-memory value -> the value you persist or send over the wire.
// Note the `_v: 'v1'` stamp that eschema adds. That stamp is the whole trick:
// it records which version this row was written at.
const encoded = Effect.runSync(
  User.encode({ name: 'Alice', email: 'alice@example.com' }),
);
console.log('encoded:', encoded);
// => { name: 'Alice', email: 'alice@example.com', _v: 'v1' }

// decode: a stored value -> your in-memory value (no metadata, latest shape).
const decoded = Effect.runSync(User.decode(encoded));
console.log('decoded:', decoded);
// => { name: 'Alice', email: 'alice@example.com' }

// Everything returns an Effect. In real code you stay inside Effect.gen and
// `yield*` these instead of runSync — see lesson 6 for that style. runSync is
// used here only to keep the lessons short.
