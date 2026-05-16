import { expect } from 'vitest';
import { Effect, Schema } from 'effect';

import { vdescribe, vtest } from '@monorepo/vtest';
import { ESchema, EntityESchema, ESchemaError } from '@std-toolkit/eschema';

vdescribe(
  'encode stamps the latest _v',
  '`_v` is written from `latestVersion`, never read from the value. The schema is the source of truth.',
  () => {
    vtest(
      'encode stamps the latest _v on a v1-only schema',
      'A freshly-made schema encodes to `_v: "v1"`.',
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const out = await Effect.runPromise(s.encode({ a: 'x' }));
        expect(out._v).toBe('v1');
      },
    );

    vtest(
      'encode stamps the latest _v after several evolutions',
      'After two evolutions the stamp is `v3`, regardless of what shape the value came from.',
      async () => {
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => ({ ...p, b: '' }))
          .evolve('v3', { c: Schema.Number }, (p) => ({ ...p, c: 0 }))
          .build();
        const out = await Effect.runPromise(s.encode({ a: 'x', b: 'y', c: 1 }));
        expect(out._v).toBe('v3');
      },
    );
  },
);

vdescribe(
  'encode runs the struct encoder',
  'Effect Schema transforms run in the encode direction; the encoded payload is the transformed shape, not the decoded one.',
  () => {
    vtest(
      'encode runs Effect Schema transforms in the encode direction',
      'A `Schema.transform(String, Number)` round-trips `42` → `"42"` on encode.',
      async () => {
        const StringToNumber = Schema.transform(Schema.String, Schema.Number, {
          decode: (s) => Number.parseInt(s, 10),
          encode: (n) => String(n),
          strict: true,
        });
        const s = ESchema.make({ count: StringToNumber }).build();
        const out = await Effect.runPromise(s.encode({ count: 42 }));
        expect(out.count).toBe('42');
      },
    );

    vtest(
      'EntityESchema encode writes idField as a regular string',
      'The id column is just `Schema.String` — no branding, no transform.',
      async () => {
        const s = EntityESchema.make('User', 'id', {
          name: Schema.String,
        }).build();
        const out = await Effect.runPromise(
          s.encode({ id: 'u1', name: 'Alice' }),
        );
        expect(out.id).toBe('u1');
        expect(out.name).toBe('Alice');
      },
    );
  },
);

vdescribe(
  'encode failure surfaces as ESchemaError',
  '`ParseError` from Effect Schema is wrapped: `message: "Encode failed"`, `cause: <ParseError>`.',
  () => {
    vtest(
      'encode of an invalid value fails with ESchemaError(message=Encode failed)',
      'A type mismatch in the input produces an `ESchemaError` whose message is `Encode failed`.',
      async () => {
        const s = ESchema.make({ a: Schema.String }).build();
        const result = await Effect.runPromise(
          s.encode({ a: 1 as unknown as string }).pipe(Effect.either),
        );
        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ESchemaError);
          expect(result.left.message).toBe('Encode failed');
        }
      },
    );
  },
);

vdescribe(
  'makePartial helper',
  '`makePartial` tags a partial value with the latest `_v`. It is type-level convenience for update-style APIs and does not validate the input.',
  () => {
    vtest(
      'makePartial tags the value with _v without validating',
      'The returned object has `_v: latestVersion` and the original keys; no schema check runs.',
      () => {
        const s = ESchema.make({ a: Schema.String })
          .evolve('v2', { b: Schema.String }, (p) => ({ ...p, b: '' }))
          .build();
        const partial = s.makePartial({ a: 'x' });
        expect(partial._v).toBe('v2');
        expect(partial.a).toBe('x');
      },
    );
  },
);
