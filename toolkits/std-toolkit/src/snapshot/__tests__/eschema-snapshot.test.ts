import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ESchema,
  EntityESchema,
  ValueESchema,
  toSchema,
} from '../../eschema/index.js';
import {
  Snapshot,
  SnapshotDecodeError,
  SnapshotIdentityConflict,
} from '../index.js';

describe('ESchema semantic snapshots', () => {
  it('captures every version and all three variants', async () => {
    const plain = ESchema.make('Payment', { amount: Schema.Number })
      .evolve('v2', { createdAt: Schema.String }, (value) => ({
        ...value,
        createdAt: 'unknown',
      }))
      .build();
    const entity = EntityESchema.make('User', 'userId', {
      homepage: Schema.String,
    }).build();
    const value = ValueESchema.make(
      'Pair',
      Schema.Tuple([Schema.Literal(1n), Schema.BigInt]),
    ).build();

    expect(Snapshot.capture(plain).schemas[0]?.versions).toHaveLength(2);
    expect(Snapshot.capture(entity).schemas[0]).toMatchObject({
      identity: 'User',
      kind: 'entity',
      idField: 'userId',
    });
    expect(Snapshot.capture(value).schemas[0]).toMatchObject({ kind: 'value' });
    expect(JSON.stringify(Snapshot.capture(value))).toContain('BigInt');
    expect(Snapshot.inspect(Snapshot.capture(plain))).toEqual([]);
    expect(Snapshot.inspect(Snapshot.capture(entity))).toEqual([]);

    const json = JSON.parse(JSON.stringify(Snapshot.capture(plain)));
    await expect(Effect.runPromise(Snapshot.decode(json))).resolves.toEqual(
      Snapshot.capture(plain),
    );
  });

  it('rejects fields that cannot be captured and restored', () => {
    expect(() =>
      ESchema.make('Payment', { amount: Schema.NumberFromString }).build(),
    ).toThrow(/amount.*transformation/i);
    expect(() =>
      ESchema.make('Limitations', {
        filtered: Schema.String.check(
          Schema.makeFilter((value) => value.length > 0 || 'empty'),
        ),
      }).build(),
    ).toThrow(/filtered.*filter/i);
    expect(() =>
      ESchema.make('Limitations', { builtInDate: Schema.Date }).build(),
    ).toThrow(/builtInDate.*declaration/i);
  });

  it('deduplicates nested schemas and rejects identity conflicts', () => {
    const child = ESchema.make('Child', { value: Schema.String }).build();
    const parent = ESchema.make('Parent', {
      first: toSchema(child),
      second: toSchema(child),
    }).build();
    const snapshot = Snapshot.capture(parent);

    expect(snapshot.schemas.map((item) => item.identity)).toEqual([
      'Child',
      'Parent',
    ]);
    const version = snapshot.schemas[1]!.versions[0]!;
    for (const representation of [version.encoded, version.decoded]) {
      expect(representation).toMatchObject({
        representation: {
          propertySignatures: expect.arrayContaining(
            ['first', 'second'].map((name) => ({
              isMutable: false,
              isOptional: false,
              name: { type: 'string', value: name },
              type: { _tag: 'ESchemaRef', identity: 'Child' },
            })),
          ),
        },
      });
    }

    const first = ESchema.make('Same', { value: Schema.String }).build();
    const second = ESchema.make('Same', { value: Schema.String }).build();
    const conflict = ESchema.make('Conflict', {
      first: toSchema(first),
      second: toSchema(second),
    }).build();
    expect(() => Snapshot.capture(conflict)).toThrow(SnapshotIdentityConflict);
  });

  it('rejects duplicate definitions and dangling references', async () => {
    const snapshot = Snapshot.capture(
      ESchema.make('Item', { value: Schema.String }).build(),
    );
    const duplicate = {
      ...snapshot,
      schemas: [...snapshot.schemas, snapshot.schemas[0]],
    };
    await expect(
      Effect.runPromise(Snapshot.decode(duplicate)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);

    const dangling = JSON.parse(JSON.stringify(snapshot));
    dangling.schemas[0]!.versions[0]!.encoded = {
      _tag: 'ESchemaRef',
      identity: 'Missing',
    };
    await expect(
      Effect.runPromise(Snapshot.decode(dangling)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);

    const malformed = JSON.parse(JSON.stringify(snapshot));
    malformed.schemas[0]!.versions[0]!.transformations = [
      { path: '/', name: 42 },
    ];
    await expect(
      Effect.runPromise(Snapshot.decode(malformed)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);

    const unstamped = JSON.parse(JSON.stringify(snapshot));
    delete unstamped._v;
    await expect(
      Effect.runPromise(Snapshot.decode(unstamped)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);
  });

  it('sorts definitions and fields without sorting meaningful schema order', () => {
    const alpha = ESchema.make('Alpha', { value: Schema.String }).build();
    const zulu = ESchema.make('Zulu', { value: Schema.Number }).build();
    const firstSchema = ESchema.make('Root', {
      zulu: toSchema(zulu),
      alpha: toSchema(alpha),
    }).build();
    const first = Snapshot.capture(firstSchema);

    const alphaAgain = ESchema.make('Alpha', { value: Schema.String }).build();
    const zuluAgain = ESchema.make('Zulu', { value: Schema.Number }).build();
    const reorderedSchema = ESchema.make('Root', {
      alpha: toSchema(alphaAgain),
      zulu: toSchema(zuluAgain),
    }).build();
    const reordered = Snapshot.capture(reorderedSchema);

    expect(JSON.stringify(first)).toBe(JSON.stringify(reordered));
    expect(Snapshot.render(first)).toBe(Snapshot.render(reordered));

    const orderedSchema = ValueESchema.make(
      'Literals',
      Schema.Tuple([
        Schema.Literals(['zulu', 'alpha']),
        Schema.Literals(['second', 'first']),
      ]),
    ).build();
    const ordered = Snapshot.capture(orderedSchema);
    const reversedSchema = ValueESchema.make(
      'Literals',
      Schema.Tuple([
        Schema.Literals(['alpha', 'zulu']),
        Schema.Literals(['first', 'second']),
      ]),
    ).build();
    const reversed = Snapshot.capture(reversedSchema);
    expect(JSON.stringify(ordered)).not.toBe(JSON.stringify(reversed));
  });
});
