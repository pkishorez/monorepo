import { expect } from 'vitest';
import { Effect, Schema } from 'effect';

import { vdescribe, vtest } from '@monorepo/vtest';
import { ESchema, EntityESchema } from '@std-toolkit/eschema';

vdescribe(
  'evolve appends versions in order',
  'Each `.evolve()` extends the chain by one version; the type of `latestVersion` and the runtime value agree.',
  () => {
    vtest(
      'v1 → v2 → v3 chain assembles in order',
      'The builder accepts `NextVersion<TVersion>` literals only; the latest version after two evolutions is `v3`.',
      () => {
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => ({ ...p, b: '' }))
          .evolve('v3', { c: Schema.Number }, (p) => ({ ...p, c: 0 }))
          .build();
        expect(s.latestVersion).toBe('v3');
      },
    );

    vtest(
      '.fields returns the latest merged schema, not a union',
      'Reading `.fields` after `.evolve()` reflects the final shape — earlier evolutions are not visible.',
      () => {
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => ({ ...p, b: '' }))
          .build();
        expect(Object.keys(s.fields).sort()).toEqual(['a', 'b']);
      },
    );
  },
);

vdescribe(
  'delta semantics: add / remove / rename',
  '`Schema` adds-or-replaces; `null` removes. A rename is `null` + new key in the same delta. `mergeDelta` is the runtime source of truth.',
  () => {
    vtest(
      'a null delta entry removes the field from .fields',
      'After `.evolve("v2", { legacy: null }, …)` the `legacy` key is not present on `.fields`.',
      () => {
        const s = ESchema.make({ a: Schema.String, legacy: Schema.String })
          .evolve('v2', { legacy: null }, (p) => ({ a: p.a }))
          .build();
        expect('legacy' in s.fields).toBe(false);
      },
    );

    vtest(
      'a non-null delta entry adds the field to .fields',
      'Adding a field with `.evolve()` makes it appear on `.fields` immediately.',
      () => {
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.Number }, (p) => ({ ...p, b: 0 }))
          .build();
        expect('b' in s.fields).toBe(true);
      },
    );

    vtest(
      'rename (remove + add) survives a v1 decode',
      'A v1 row is migrated through the rename and emerges at the new key.',
      async () => {
        const s = ESchema.make({
          firstName: Schema.String,
          lastName: Schema.String,
        })
          .evolve(
            'v2',
            {
              firstName: null,
              lastName: null,
              fullName: Schema.String,
            },
            (p) => ({ fullName: `${p.firstName} ${p.lastName}` }),
          )
          .build();
        const out = await Effect.runPromise(
          s.decode({ _v: 'v1', firstName: 'John', lastName: 'Doe' }),
        );
        expect(out).toEqual({ fullName: 'John Doe' });
      },
    );
  },
);

vdescribe(
  'migration is pure and version-aware',
  'Migrations receive the previous decoded shape, are run only when reading a strictly older version, and propagate exceptions raw.',
  () => {
    vtest(
      'migration is invoked only for older versions',
      'A row already at the latest version skips every migration step.',
      async () => {
        let calls = 0;
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => {
            calls += 1;
            return { ...p, b: '' };
          })
          .build();
        await Effect.runPromise(s.decode({ _v: 'v2', a: 'x', b: 'y' }));
        expect(calls).toBe(0);
      },
    );

    vtest(
      'migration sees the previous decoded shape',
      "The migration argument matches the previous evolution's struct, not the raw input row.",
      async () => {
        let seen: unknown;
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => {
            seen = p;
            return { ...p, b: 'added' };
          })
          .build();
        await Effect.runPromise(s.decode({ _v: 'v1', a: 'hi' }));
        expect(seen).toEqual({ a: 'hi' });
      },
    );
  },
);

vdescribe(
  'EntityESchema.evolve re-injects idField',
  "The id column is added on every step by the builder's postMerge hook, even if the delta does not mention it.",
  () => {
    vtest(
      'idField appears on .fields after every evolution',
      'A v2 entity still has its id field even though the v2 delta only added new columns.',
      () => {
        const s = EntityESchema.make('User', 'id', { name: Schema.String })
          .evolve('v2', { age: Schema.Number }, (p) => ({ ...p, age: 0 }))
          .build();
        expect('id' in s.fields).toBe(true);
      },
    );

    vtest(
      'EntityESchema.evolve rejects the id field in the delta at type level',
      'A delta that mentions the id field collides with `ForbidIdField<D, IdField>` at compile time.',
      () => {
        const builder = EntityESchema.make('User', 'id', {
          name: Schema.String,
        });
        // @ts-expect-error — `id` is reserved as the id field.
        builder.evolve('v2', { id: Schema.String }, (p) => p);
        expect(true).toBe(true);
      },
    );
  },
);
