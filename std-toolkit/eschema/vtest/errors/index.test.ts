import { expect } from 'vitest';
import { Effect, Schema } from 'effect';

import { vdescribe, vtest } from '@monorepo/vtest';
import { ESchema, ESchemaError } from '@std-toolkit/eschema';

vdescribe(
  'ESchemaError shape',
  '`ESchemaError` is a tagged error with a fixed message vocabulary and an optional `cause` carrying the underlying failure.',
  () => {
    vtest(
      'ESchemaError._tag is ESchemaError',
      '`Data.TaggedError` sets `_tag` so `Effect.catchTag` can match it across realms.',
      () => {
        const err = new ESchemaError({ message: 'x' });
        expect(err._tag).toBe('ESchemaError');
      },
    );

    vtest(
      'encode failure has message=Encode failed and a cause',
      'A type mismatch on encode wraps the Effect Schema `ParseError` as `cause`.',
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const result = await Effect.runPromise(
          s.encode({ a: 1 as unknown as string }).pipe(Effect.either),
        );
        if (result._tag === 'Left') {
          expect(result.left.message).toBe('Encode failed');
          expect(result.left.cause).toBeDefined();
        } else {
          throw new Error('expected Left');
        }
      },
    );

    vtest(
      'decode failure (bad shape) has message=Decode failed and a cause',
      "The struct decoder's `ParseError` is carried in `cause`; the wrapper message is constant.",
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const result = await Effect.runPromise(
          s.decode({ _v: 'v1', a: 42 }).pipe(Effect.either),
        );
        if (result._tag === 'Left') {
          expect(result.left.message).toBe('Decode failed');
          expect(result.left.cause).toBeDefined();
        } else {
          throw new Error('expected Left');
        }
      },
    );

    vtest(
      'decode of an unknown _v embeds the offending version string',
      'The rendered message is `Unknown schema version: <_v>` so logs identify the stale producer.',
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const result = await Effect.runPromise(
          s.decode({ _v: 'v42', a: 'x' }).pipe(Effect.either),
        );
        if (result._tag === 'Left') {
          expect(result.left.message).toContain('v42');
        } else {
          throw new Error('expected Left');
        }
      },
    );
  },
);

vdescribe(
  'catchTag recovers every failure mode',
  '`Effect.catchTag("ESchemaError", …)` is the canonical recovery point for every schema-level failure.',
  () => {
    vtest(
      'catchTag recovers from decode failure',
      'A wrapped `ESchemaError` from `decode` is caught by the tag handler and replaced with a fallback.',
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const recovered = await Effect.runPromise(
          s
            .decode({ _v: 'v1', a: 42 })
            .pipe(
              Effect.catchTag('ESchemaError', () =>
                Effect.succeed({ a: 'fallback' }),
              ),
            ),
        );
        expect(recovered).toEqual({ a: 'fallback' });
      },
    );

    vtest(
      'catchTag recovers from unknown version failure',
      'Version-mismatch errors share the same `_tag`, so a single `catchTag` handler covers them too.',
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const recovered = await Effect.runPromise(
          s
            .decode({ _v: 'v99', a: 'x' })
            .pipe(
              Effect.catchTag('ESchemaError', () =>
                Effect.succeed({ a: 'fallback' }),
              ),
            ),
        );
        expect(recovered).toEqual({ a: 'fallback' });
      },
    );
  },
);
