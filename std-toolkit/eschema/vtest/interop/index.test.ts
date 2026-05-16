import { expect } from 'vitest';
import { Effect, Schema } from 'effect';

import { vdescribe, vtest } from '@monorepo/vtest';
import { ESchema, toSchema } from '@std-toolkit/eschema';

const v1tov2 = ESchema.make({ a: Schema.String })
  .evolve('v2', { b: Schema.String }, (p) => ({ ...p, b: 'B' }))
  .build();

vdescribe(
  'toSchema embeds an ESchema in another Schema',
  '`toSchema(eschema)` wraps the schema in `Schema.declare`; both `decode` and `encode` delegate to the evolving schema and run the full migration chain.',
  () => {
    vtest(
      'toSchema round-trips a v1 row through the parent decoder, fully migrated',
      'A row stamped `_v: "v1"` inside an envelope ends up at the latest shape after parent decode.',
      async () => {
        const Envelope = Schema.Struct({ payload: toSchema(v1tov2) });
        const out = await Effect.runPromise(
          Schema.decodeUnknown(Envelope)({
            payload: { _v: 'v1', a: 'A' },
          }),
        );
        expect(out.payload).toEqual({ a: 'A', b: 'B' });
      },
    );

    vtest(
      'toSchema maps ESchemaError to ParseResult.Type with the error message',
      'A failed embedded decode surfaces as a parent `ParseError` carrying the original `ESchemaError.message`.',
      async () => {
        const Envelope = Schema.Struct({ payload: toSchema(v1tov2) });
        const result = await Effect.runPromise(
          Schema.decodeUnknown(Envelope)({
            payload: { _v: 'v99', a: 'A' },
          }).pipe(Effect.either),
        );
        expect(result._tag).toBe('Left');
      },
    );
  },
);

vdescribe(
  'getDescriptor renders a JSON Schema with the _v literal',
  '`_v` is injected as `Schema.Literal(latestVersion)` so any JSON Schema consumer sees the version as a required constant.',
  () => {
    vtest(
      'getDescriptor includes _v as a literal at the latest version',
      "The descriptor's `properties._v.const` is `latestVersion`.",
      () => {
        const desc = v1tov2.getDescriptor();
        const props = (
          desc as unknown as {
            properties: Record<string, { enum?: string[] }>;
          }
        ).properties;
        expect(props._v?.enum).toEqual(['v2']);
      },
    );
  },
);

vdescribe(
  'standard schema v1 surface',
  '`~standard.validate` runs `decode` synchronously and maps the Exit into `{ value }` or `{ issues }`. The vendor and version are fixed.',
  () => {
    vtest(
      '~standard.vendor is @std-toolkit/eschema and version is 1',
      'These values are part of the public contract with Standard Schema consumers.',
      () => {
        expect(v1tov2['~standard'].vendor).toBe('@std-toolkit/eschema');
        expect(v1tov2['~standard'].version).toBe(1);
      },
    );

    vtest(
      '~standard.validate returns { value } on success',
      'A valid row decodes to the latest shape; the result has `value` only, no `issues`.',
      () => {
        const r = v1tov2['~standard'].validate({ _v: 'v1', a: 'A' });
        expect('value' in r).toBe(true);
      },
    );

    vtest(
      '~standard.validate returns { issues: [{ message }] } on decode failure',
      'A type mismatch produces a single issue whose message is `Decode failed`.',
      () => {
        const r = v1tov2['~standard'].validate({ _v: 'v1', a: 1 });
        expect('issues' in r).toBe(true);
        if ('issues' in r) {
          expect(r.issues?.[0]?.message).toBe('Decode failed');
        }
      },
    );

    vtest(
      '~standard.validate returns the Unknown schema version message verbatim',
      'An unrecognised `_v` propagates through to the `issues[0].message` field.',
      () => {
        const r = v1tov2['~standard'].validate({ _v: 'v99', a: 'A' });
        expect('issues' in r).toBe(true);
        if ('issues' in r) {
          expect(r.issues?.[0]?.message).toContain('v99');
        }
      },
    );
  },
);
