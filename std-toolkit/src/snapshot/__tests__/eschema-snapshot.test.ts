import { Effect, Schema, SchemaTransformation } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ESchema,
  EntityESchema,
  SingleEntityESchema,
  ValueESchema,
  toSchema,
} from '../../eschema/index.js';
import {
  Snapshot,
  SnapshotDecodeError,
  SnapshotIdentityConflict,
} from '../index.js';

const customTransform = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: Number,
      encode: String,
    }),
  ),
);

describe('ESchema semantic snapshots', () => {
  it('captures every version and all four variants', async () => {
    const plain = ESchema.make('Payment', { amount: Schema.NumberFromString })
      .evolve('v2', { createdAt: Schema.Date }, (value) => ({
        ...value,
        createdAt: new Date(0),
      }))
      .build();
    const single = SingleEntityESchema.make('Settings', {
      enabled: Schema.Boolean,
    }).build();
    const entity = EntityESchema.make('User', 'userId', {
      homepage: Schema.URLFromString,
    }).build();
    const value = ValueESchema.make(
      'Pair',
      Schema.Tuple([Schema.Literal(1n), Schema.BigInt]),
    ).build();

    expect(plain.snapshot().schemas[0]?.versions).toHaveLength(2);
    expect(single.snapshot()).toMatchObject({ root: 'Settings' });
    expect(entity.snapshot().schemas[0]).toMatchObject({
      identity: 'User',
      kind: 'entity',
      idField: 'userId',
    });
    expect(value.snapshot().schemas[0]).toMatchObject({ kind: 'value' });
    expect(JSON.stringify(value.snapshot())).toContain('BigInt');
    expect(
      plain.snapshot().schemas[0]?.versions[0]?.transformations,
    ).toContainEqual(expect.objectContaining({ name: 'numberFromString' }));
    expect(Snapshot.inspect(plain.snapshot())).toEqual([]);
    expect(Snapshot.inspect(entity.snapshot())).toEqual([]);

    const json = JSON.parse(JSON.stringify(plain.snapshot()));
    await expect(Effect.runPromise(Snapshot.decode(json))).resolves.toEqual(
      plain.snapshot(),
    );
  });

  it('stores custom runtime limitations while retaining both sides', () => {
    const declaration = Schema.declare(
      (input: unknown): input is string => typeof input === 'string',
    );
    const filtered = Schema.String.check(
      Schema.makeFilter((value) => value.length > 0 || 'empty'),
    );
    const snapshot = ESchema.make('Limitations', {
      customTransform,
      declaration,
      filtered,
      builtInDate: Schema.Date,
    })
      .build()
      .snapshot();
    const version = snapshot.schemas[0]!.versions[0]!;

    expect(version.encoded).toBeDefined();
    expect(version.decoded).toBeDefined();
    expect(version.unverifiable.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['transformation', 'declaration', 'filter']),
    );
    expect(Snapshot.inspect(snapshot)).toHaveLength(
      version.unverifiable.length,
    );
  });

  it('deduplicates nested schemas and rejects identity conflicts', () => {
    const child = ESchema.make('Child', { value: Schema.String }).build();
    const parent = ESchema.make('Parent', {
      first: toSchema(child),
      second: toSchema(child),
    }).build();
    const snapshot = parent.snapshot();

    expect(snapshot.schemas.map((item) => item.identity)).toEqual([
      'Child',
      'Parent',
    ]);
    expect(JSON.stringify(snapshot).match(/ESchemaRef/g)).toHaveLength(4);

    const first = ESchema.make('Same', { value: Schema.String }).build();
    const second = ESchema.make('Same', { value: Schema.String }).build();
    const conflict = ESchema.make('Conflict', {
      first: toSchema(first),
      second: toSchema(second),
    }).build();
    expect(() => conflict.snapshot()).toThrow(SnapshotIdentityConflict);
  });

  it('rejects duplicate definitions and dangling references', async () => {
    const snapshot = ESchema.make('Item', { value: Schema.String })
      .build()
      .snapshot();
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
    const first = ESchema.make('Root', {
      zulu: toSchema(zulu),
      alpha: toSchema(alpha),
    })
      .build()
      .snapshot();

    const alphaAgain = ESchema.make('Alpha', { value: Schema.String }).build();
    const zuluAgain = ESchema.make('Zulu', { value: Schema.Number }).build();
    const reordered = ESchema.make('Root', {
      alpha: toSchema(alphaAgain),
      zulu: toSchema(zuluAgain),
    })
      .build()
      .snapshot();

    expect(JSON.stringify(first)).toBe(JSON.stringify(reordered));
    expect(Snapshot.render(first)).toBe(Snapshot.render(reordered));

    const ordered = ValueESchema.make(
      'Literals',
      Schema.Tuple([
        Schema.Literals(['zulu', 'alpha']),
        Schema.Literals(['second', 'first']),
      ]),
    )
      .build()
      .snapshot();
    const reversed = ValueESchema.make(
      'Literals',
      Schema.Tuple([
        Schema.Literals(['alpha', 'zulu']),
        Schema.Literals(['first', 'second']),
      ]),
    )
      .build()
      .snapshot();
    expect(JSON.stringify(ordered)).not.toBe(JSON.stringify(reversed));
  });
});
