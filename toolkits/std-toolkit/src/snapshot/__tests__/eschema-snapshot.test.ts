import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ESchema,
  EntityESchema,
  ValueESchema,
  checkAnnotation,
  toSchema,
  type SnapshotType,
} from '../../eschema/index.js';
import {
  SnapshotDecodeError,
  SnapshotIdentityConflict,
} from '../domain/index.js';
import { TableSnapshot } from '../index.js';
import { snapshotOf } from './helpers.js';

const shapeOf = (eschema: object, version = 0): SnapshotType =>
  snapshotOf(eschema).schemas[0]!.versions[version]!.shape;

const fieldOf = (eschema: object, name: string): SnapshotType => {
  const shape = shapeOf(eschema);
  if (shape.type !== 'struct') throw new Error('not a struct');
  return shape.fields.find((field) => field.name === name)!.type;
};

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
      'Tags',
      Schema.Array(Schema.Literals(['a', 'b'])),
    ).build();

    expect(snapshotOf(plain).schemas[0]?.versions).toHaveLength(2);
    expect(shapeOf(plain, 1)).toEqual({
      type: 'struct',
      fields: [
        { name: 'amount', type: { type: 'number' } },
        { name: 'createdAt', type: { type: 'string' } },
      ],
    });
    expect(snapshotOf(entity).schemas[0]).toMatchObject({
      identity: 'User',
      kind: 'entity',
      idField: 'userId',
    });
    expect(snapshotOf(value).schemas[0]).toMatchObject({ kind: 'value' });
    expect(shapeOf(value)).toEqual({
      type: 'array',
      element: {
        type: 'union',
        members: [
          { type: 'literal', value: 'a' },
          { type: 'literal', value: 'b' },
        ],
      },
    });

    const json = JSON.parse(JSON.stringify(snapshotOf(plain)));
    await expect(Effect.runPromise(TableSnapshot.parse(json))).resolves.toEqual(
      snapshotOf(plain),
    );
  });

  it('describes each supported type in its own terms', () => {
    enum Status {
      Open = 'open',
      Done = 'done',
    }
    const shapes = ESchema.make('Shapes', {
      text: Schema.String,
      count: Schema.Number,
      flag: Schema.Boolean,
      nothing: Schema.Null,
      maybe: Schema.NullOr(Schema.Literals(['x', 'y'])),
      status: Schema.Enum(Status),
      counts: Schema.Record(Schema.String, Schema.Number),
      opaque: ESchema.fromType<{ readonly any: true }>(),
      nested: Schema.Struct({ note: Schema.optionalKey(Schema.String) }),
    }).build();

    expect(fieldOf(shapes, 'nothing')).toEqual({ type: 'null' });
    expect(fieldOf(shapes, 'maybe')).toEqual({
      type: 'union',
      members: [
        { type: 'literal', value: 'x' },
        { type: 'literal', value: 'y' },
        { type: 'null' },
      ],
    });
    expect(fieldOf(shapes, 'status')).toEqual({
      type: 'union',
      members: [
        { type: 'literal', value: 'open' },
        { type: 'literal', value: 'done' },
      ],
    });
    expect(fieldOf(shapes, 'counts')).toEqual({
      type: 'record',
      value: { type: 'number' },
    });
    expect(fieldOf(shapes, 'opaque')).toEqual({ type: 'unknown' });
    expect(fieldOf(shapes, 'nested')).toEqual({
      type: 'struct',
      fields: [{ name: 'note', optional: true, type: { type: 'string' } }],
    });
  });

  it('describes an enum and the literals of its values the same way', () => {
    enum Status {
      Open = 'open',
      Done = 'done',
    }
    const asEnum = ESchema.make('Status', {
      status: Schema.Enum(Status),
    }).build();
    const asLiterals = ESchema.make('Status', {
      status: Schema.Literals(['open', 'done']),
    }).build();
    expect(shapeOf(asEnum)).toEqual(shapeOf(asLiterals));
  });

  it('captures the encoded side of a transformation', () => {
    const payment = ESchema.make('Payment', {
      amount: Schema.NumberFromString.check(Schema.isInt()),
    }).build();
    expect(fieldOf(payment, 'amount')).toEqual({ type: 'string' });
  });

  it('records built-in and named checks with their arguments', () => {
    const slug = Schema.makeFilter(
      (value: string) => /^[a-z-]+$/.test(value),
      checkAnnotation({ name: 'slug', description: 'lowercase words' }),
    );
    const checked = ESchema.make('Checked', {
      title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
      handle: Schema.String.check(slug),
      score: Schema.Number.check(
        Schema.isInt(),
        Schema.isBetween({ minimum: 0, maximum: 10 }),
      ),
      tags: Schema.Array(Schema.String).check(Schema.isMaxLength(5)),
    }).build();

    expect(fieldOf(checked, 'title')).toEqual({
      type: 'string',
      checks: [
        { check: 'minLength', minLength: 1 },
        { check: 'maxLength', maxLength: 80 },
      ],
    });
    expect(fieldOf(checked, 'handle')).toEqual({
      type: 'string',
      checks: [
        { check: 'custom', name: 'slug', description: 'lowercase words' },
      ],
    });
    expect(fieldOf(checked, 'score')).toEqual({
      type: 'number',
      checks: [{ check: 'int' }, { check: 'between', minimum: 0, maximum: 10 }],
    });
    expect(fieldOf(checked, 'tags')).toMatchObject({
      type: 'array',
      checks: [{ check: 'maxLength', maxLength: 5 }],
    });
  });

  it('rejects fields a snapshot cannot describe', () => {
    expect(() =>
      ESchema.make('Limitations', { builtInDate: Schema.Date }).build(),
    ).toThrow(/builtInDate.*declared type/i);
    expect(() =>
      ESchema.make('Limitations', {
        pair: Schema.Tuple([Schema.String, Schema.Number]),
      }).build(),
    ).toThrow(/pair.*tuple/i);
    expect(() =>
      ESchema.make('Limitations', { big: Schema.BigInt }).build(),
    ).toThrow(/big.*BigInt/);
    expect(() =>
      ESchema.make('Limitations', {
        filtered: Schema.String.check(
          Schema.makeFilter((value) => value.length > 0 || 'empty'),
        ),
      }).build(),
    ).toThrow(/filtered.*check catalogue/i);
    expect(() =>
      ESchema.make('Limitations', {
        code: Schema.String.check(
          Schema.isPattern(/^a/),
          Schema.isPattern(/b$/),
        ),
      }).build(),
    ).toThrow(/code.*two checks are named "pattern"/);
  });

  it('tells two checks of one kind apart by name', () => {
    const code = ESchema.make('Code', {
      code: Schema.String.check(
        Schema.isPattern(/^a/, checkAnnotation({ name: 'startsWithA' })),
        Schema.isPattern(/b$/),
      ),
    }).build();
    expect(fieldOf(code, 'code')).toEqual({
      type: 'string',
      checks: [
        { check: 'custom', name: 'startsWithA' },
        { check: 'pattern', source: 'b$', flags: '' },
      ],
    });
  });

  it('describes a recursive schema without generated names', () => {
    interface Tree {
      readonly label: string;
      readonly children: readonly Tree[];
    }
    const TreeSchema: Schema.Codec<Tree> = Schema.Struct({
      label: Schema.String,
      children: Schema.Array(
        Schema.suspend((): Schema.Codec<Tree> => TreeSchema),
      ),
    });
    const Node = Schema.suspend((): Schema.Codec<Tree> => TreeSchema);
    const forest = ValueESchema.make('Forest', Schema.Array(Node)).build();

    expect(shapeOf(forest)).toEqual({
      type: 'array',
      element: {
        type: 'recursive',
        body: {
          type: 'struct',
          fields: [
            {
              name: 'children',
              type: { type: 'array', element: { type: 'recurse', depth: 0 } },
            },
            { name: 'label', type: { type: 'string' } },
          ],
        },
      },
    });
  });

  it('deduplicates nested schemas and rejects identity conflicts', () => {
    const child = ESchema.make('Child', { value: Schema.String }).build();
    const parent = ESchema.make('Parent', {
      first: toSchema(child),
      second: toSchema(child),
    }).build();
    const snapshot = snapshotOf(parent);

    expect(snapshot.schemas.map((item) => item.identity)).toEqual([
      'Child',
      'Parent',
    ]);
    expect(snapshot.schemas[1]!.versions[0]!.shape).toEqual({
      type: 'struct',
      fields: [
        { name: 'first', type: { type: 'ref', identity: 'Child' } },
        { name: 'second', type: { type: 'ref', identity: 'Child' } },
      ],
    });

    const first = ESchema.make('Same', { value: Schema.String }).build();
    const second = ESchema.make('Same', { value: Schema.String }).build();
    const conflict = ESchema.make('Conflict', {
      first: toSchema(first),
      second: toSchema(second),
    }).build();
    expect(() => snapshotOf(conflict)).toThrow(SnapshotIdentityConflict);
  });

  it('rejects duplicate definitions and dangling references', async () => {
    const snapshot = snapshotOf(
      ESchema.make('Item', { value: Schema.String }).build(),
    );
    const duplicate = {
      ...snapshot,
      schemas: [...snapshot.schemas, snapshot.schemas[0]],
    };
    await expect(
      Effect.runPromise(TableSnapshot.parse(duplicate)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);

    const dangling = JSON.parse(JSON.stringify(snapshot));
    dangling.schemas[0]!.versions[0]!.shape = {
      type: 'ref',
      identity: 'Missing',
    };
    await expect(
      Effect.runPromise(TableSnapshot.parse(dangling)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);

    const malformed = JSON.parse(JSON.stringify(snapshot));
    malformed.schemas[0]!.versions[0]!.shape = { type: 'date' };
    await expect(
      Effect.runPromise(TableSnapshot.parse(malformed)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);
  });

  it('sorts definitions and fields without sorting meaningful schema order', () => {
    const alpha = ESchema.make('Alpha', { value: Schema.String }).build();
    const zulu = ESchema.make('Zulu', { value: Schema.Number }).build();
    const firstSchema = ESchema.make('Root', {
      zulu: toSchema(zulu),
      alpha: toSchema(alpha),
    }).build();
    const first = snapshotOf(firstSchema);

    const alphaAgain = ESchema.make('Alpha', { value: Schema.String }).build();
    const zuluAgain = ESchema.make('Zulu', { value: Schema.Number }).build();
    const reorderedSchema = ESchema.make('Root', {
      alpha: toSchema(alphaAgain),
      zulu: toSchema(zuluAgain),
    }).build();
    const reordered = snapshotOf(reorderedSchema);

    expect(JSON.stringify(first)).toBe(JSON.stringify(reordered));

    const ordered = snapshotOf(
      ValueESchema.make('Literals', Schema.Literals(['zulu', 'alpha'])).build(),
    );
    const reversed = snapshotOf(
      ValueESchema.make('Literals', Schema.Literals(['alpha', 'zulu'])).build(),
    );
    expect(JSON.stringify(ordered)).not.toBe(JSON.stringify(reversed));
  });
});
