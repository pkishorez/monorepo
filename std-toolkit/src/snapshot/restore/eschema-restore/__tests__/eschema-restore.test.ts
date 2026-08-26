import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../../../eschema/index.js';
import { captureESchema } from '../../../capture/eschema-capture/index.js';
import { inspectESchema } from '../../../../eschema/domain/introspection/index.js';
import { restoreESchemaDefinitions } from '../index.js';

function capture(eschema: object) {
  return captureESchema(eschema, inspectESchema(eschema).name);
}

function decode(schema: Schema.Top, input: unknown): unknown {
  return Schema.decodeUnknownSync(schema as Schema.Codec<unknown, unknown>)(
    input,
  );
}

describe('restoreESchemaDefinitions', () => {
  it('restores a struct field and decodes real data', () => {
    const Payment = ESchema.make('Payment', {
      amount: Schema.Number,
      tag: Schema.Literals(['debit', 'credit']),
    }).build();

    const snapshot = capture(Payment);
    const json = JSON.parse(JSON.stringify(snapshot));
    const [restored] = restoreESchemaDefinitions(json.schemas);
    const version = restored!.versions[0]!;

    expect(decode(version.decoded, { amount: 5, tag: 'debit' })).toEqual({
      amount: 5,
      tag: 'debit',
    });
    expect(
      decode(version.encoded, { amount: 5, tag: 'debit', _v: 'v1' }),
    ).toEqual({ amount: 5, tag: 'debit', _v: 'v1' });
  });

  it('resolves a composed field to the referenced identity', () => {
    const Child = ESchema.make('Child', { value: Schema.String }).build();
    const Parent = ESchema.make('Parent', {
      name: Schema.String,
      child: toSchema(Child),
    }).build();

    const snapshot = capture(Parent);
    const json = JSON.parse(JSON.stringify(snapshot));
    const restored = restoreESchemaDefinitions(json.schemas);
    const parent = restored.find((entry) => entry.identity === 'Parent')!;
    const decoded = decode(parent.versions[0]!.decoded, {
      name: 'root',
      child: { value: 'leaf' },
    });

    expect(decoded).toEqual({ name: 'root', child: { value: 'leaf' } });
  });
});
