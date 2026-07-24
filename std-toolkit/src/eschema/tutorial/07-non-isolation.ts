/**
 * Lesson 7 — The composition gotcha: non-isolation
 *
 * This is the one surprising rule, and it follows directly from lesson 6: a
 * nested schema decodes through its OWN chain. The consequence:
 *
 *   Evolving a nested schema changes what its PARENT decodes to — even though
 *   the parent's own version never changed.
 *
 * A parent stamped `v1` whose child evolved `v1 -> v2` will now yield child
 * values folded forward to v2. The parent's decoded shape shifted without any
 * change to the parent's `_v`. This is intended (the nested value migrates
 * independently), but it means you cannot reason about one schema in isolation.
 *
 * Practical rule: the "no-op until you evolve past v1" guarantee is a statement
 * about the WHOLE nesting tree, not a single schema. When you evolve a child,
 * audit every parent that embeds it.
 *
 * Run it:  npx tsx src/tutorial/07-non-isolation.ts
 */
import { Effect, Schema } from 'effect';
import { ESchema, toSchema } from '../index.js';

// --- Version A of the world: child has only v1 ----------------------------
const ChildV1 = ESchema.make('Child', { value: Schema.String }).build();
const ParentA = ESchema.make('Parent', {
  name: Schema.String,
  child: toSchema(ChildV1),
}).build();

// --- Version B of the world: the SAME child, now evolved to v2 ------------
// The parent definition is byte-for-byte identical; only the child changed.
const ChildV2 = ESchema.make('Child', { value: Schema.String })
  .evolve('v2', { tag: Schema.String }, (prev) => ({ ...prev, tag: 'default' }))
  .build();
const ParentB = ESchema.make('Parent', {
  name: Schema.String,
  child: toSchema(ChildV2),
}).build();

// The exact same stored row, parent still stamped v1, child still stamped v1.
const row = { _v: 'v1', name: 'demo', child: { _v: 'v1', value: 'hello' } };

Effect.runSync(
  Effect.gen(function* () {
    const before = yield* ParentA.decode(row);
    console.log('before child evolved:', before);
    // => { name: 'demo', child: { value: 'hello' } }

    const after = yield* ParentB.decode(row);
    console.log('after child evolved: ', after);
    // => { name: 'demo', child: { value: 'hello', tag: 'default' } }
    //                                              ^^^^^^^^^^^^^^^
    // The parent's `_v` is still v1, yet its decoded shape changed. That's
    // non-isolation: child evolution is observable at the parent.
  }),
);
