import { expect } from 'vitest';
import { Effect, Schema } from 'effect';

import { vdescribe, vtest } from '@monorepo/vtest';
import { ESchema, EntityESchema, ESchemaError } from '@std-toolkit/eschema';

vdescribe(
  'decode folds migrations forward',
  "A row stamped with an older `_v` is decoded against that evolution's struct and then run through every subsequent migration.",
  () => {
    vtest(
      'v1 → latest migration chain folds every step',
      'A v1 row in a v1→v2→v3 schema emerges with every field added by intermediate migrations.',
      async () => {
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => ({ ...p, b: 'B' }))
          .evolve('v3', { c: Schema.Number }, (p) => ({ ...p, c: 3 }))
          .build();
        const out = await Effect.runPromise(s.decode({ _v: 'v1', a: 'A' }));
        expect(out).toEqual({ a: 'A', b: 'B', c: 3 });
      },
    );

    vtest(
      'migration runs only for versions strictly older than the row',
      'A v2 row in the same v1→v2→v3 chain runs only the v2→v3 migration; the v1→v2 migration is skipped.',
      async () => {
        let v1Calls = 0;
        let v2Calls = 0;
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => {
            v1Calls += 1;
            return { ...p, b: 'B' };
          })
          .evolve('v3', { c: Schema.Number }, (p) => {
            v2Calls += 1;
            return { ...p, c: 3 };
          })
          .build();
        await Effect.runPromise(s.decode({ _v: 'v2', a: 'A', b: 'b' }));
        expect(v1Calls).toBe(0);
        expect(v2Calls).toBe(1);
      },
    );
  },
);

vdescribe(
  'decode handles missing or unknown _v',
  'A missing `_v` is treated as the latest version. An unknown `_v` fails with a descriptive `ESchemaError`.',
  () => {
    vtest(
      'missing _v falls back to latestVersion',
      'No migrations run; the row is decoded directly against the latest struct.',
      async () => {
        let migrated = 0;
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => {
            migrated += 1;
            return { ...p, b: 'B' };
          })
          .build();
        const out = await Effect.runPromise(s.decode({ a: 'A', b: 'B' }));
        expect(out).toEqual({ a: 'A', b: 'B' });
        expect(migrated).toBe(0);
      },
    );

    vtest(
      'unknown _v fails with Unknown schema version: <v>',
      'The message includes the offending version string so callers can diagnose stale producers without inspecting the chain.',
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const result = await Effect.runPromise(
          s.decode({ _v: 'v99', a: 'A' }).pipe(Effect.either),
        );
        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ESchemaError);
          expect(result.left.message).toContain('v99');
        }
      },
    );
  },
);

vdescribe(
  'decode failure surfaces as ESchemaError(Decode failed)',
  'A `ParseError` from Effect Schema is wrapped with the constant message `Decode failed`; the original error is carried in `cause`.',
  () => {
    vtest(
      'decode of a bad shape fails with ESchemaError(Decode failed)',
      'A type mismatch in the input fails the struct decoder and surfaces as a wrapped `ESchemaError`.',
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const result = await Effect.runPromise(
          s.decode({ _v: 'v1', a: 42 }).pipe(Effect.either),
        );
        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ESchemaError);
          expect(result.left.message).toBe('Decode failed');
          expect(result.left.cause).toBeDefined();
        }
      },
    );
  },
);

vdescribe(
  'EntityESchema decode requires the id field',
  'The id column is part of the struct on every version; decoding a row without it is a `Decode failed`.',
  () => {
    vtest(
      'EntityESchema decode succeeds with idField present',
      'A row with `id` is decoded; the id is part of the output.',
      async () => {
        const s = EntityESchema.make('User', 'id', {
          name: Schema.String,
        }).build();
        const out = await Effect.runPromise(
          s.decode({ _v: 'v1', id: 'u1', name: 'Alice' }),
        );
        expect(out).toEqual({ id: 'u1', name: 'Alice' });
      },
    );

    vtest(
      'EntityESchema decode fails without idField',
      'A row missing `id` fails the struct decoder; the wrapped error is `Decode failed`.',
      async () => {
        const s = EntityESchema.make('User', 'id', {
          name: Schema.String,
        }).build();
        const result = await Effect.runPromise(
          s.decode({ _v: 'v1', name: 'Alice' }).pipe(Effect.either),
        );
        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect((result.left as ESchemaError).message).toBe('Decode failed');
        }
      },
    );
  },
);
