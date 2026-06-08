import { ESchema, toSchema } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

const Inner = ESchema.make({ a: Schema.String })
  .evolve('v2', { b: Schema.NullOr(Schema.String) }, (prev) => ({
    ...prev,
    b: null,
  }))
  .build();

const Outer = ESchema.make({
  inner: toSchema(Inner, { name: 'Inner' }),
}).build();

vdescribe(
  'evolving a child shifts what an unchanged parent decodes',
  'decode behaviour is a property of the whole tree, not one schema',
  () => {
    vtest(
      'a v1 parent yields a child folded forward to the child’s latest',
      'the parent never moved, but its decoded shape did',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* Outer.decode({
              _v: 'v1',
              inner: { _v: 'v1', a: 'hello' },
            });
            if (decoded.inner.a !== 'hello' || decoded.inner.b !== null) {
              throw new Error('child was not folded forward inside the parent');
            }
          }),
        ),
    );
  },
);
