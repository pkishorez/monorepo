import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Shape } from '../../../server/rpc/session/contract/index.ts';
import { payloadOf, shapeOf, textOf } from '../real/shape.ts';

const field = (
  name: string,
  shape: unknown,
  more: { optional?: boolean; nullable?: boolean; description?: string } = {},
) => ({
  name,
  optional: more.optional ?? false,
  nullable: more.nullable ?? false,
  ...(more.description ? { description: more.description } : {}),
  shape,
});

describe('a Shape', () => {
  it('reads text, numbers and switches', () => {
    expect(shapeOf(Schema.String)).toEqual({ kind: 'text' });
    expect(shapeOf(Schema.TemplateLiteral(['id-', Schema.Number]))).toEqual({
      kind: 'text',
    });
    expect(shapeOf(Schema.Number)).toEqual({ kind: 'number' });
    expect(shapeOf(Schema.Boolean)).toEqual({ kind: 'boolean' });
  });

  it('reads a choice from literals, one or many, and from an enum', () => {
    expect(shapeOf(Schema.Literal('red'))).toEqual({
      kind: 'choice',
      options: ['red'],
    });
    expect(shapeOf(Schema.Literals(['red', 'blue', 3]))).toEqual({
      kind: 'choice',
      options: ['red', 'blue', 3],
    });
    enum Size {
      Small = 'small',
      Large = 'large',
    }
    expect(shapeOf(Schema.Enum(Size))).toEqual({
      kind: 'choice',
      options: ['small', 'large'],
    });
  });

  it('reads a struct: each field with its name, whether optional or nullable, and its description', () => {
    expect(
      shapeOf(
        Schema.Struct({
          name: Schema.String.annotate({ description: 'What it is called' }),
          seats: Schema.optionalKey(Schema.Number),
          owner: Schema.NullOr(Schema.String),
          color: Schema.optional(
            Schema.NullOr(Schema.Literals(['red', 'blue'])),
          ),
        }),
      ),
    ).toEqual({
      kind: 'struct',
      fields: [
        field('name', { kind: 'text' }, { description: 'What it is called' }),
        field('seats', { kind: 'number' }, { optional: true }),
        field('owner', { kind: 'text' }, { nullable: true }),
        field(
          'color',
          { kind: 'choice', options: ['red', 'blue'] },
          { optional: true, nullable: true },
        ),
      ],
    });
  });

  it('reads an array, and a nested struct', () => {
    expect(shapeOf(Schema.Array(Schema.Struct({ id: Schema.Number })))).toEqual(
      {
        kind: 'array',
        of: { kind: 'struct', fields: [field('id', { kind: 'number' })] },
      },
    );
  });

  it('reads the encoded side, as the panel shows and sends it: a Date is its string', () => {
    expect(shapeOf(Schema.DateFromString)).toEqual({ kind: 'text' });
    expect(shapeOf(Schema.NumberFromString)).toEqual({ kind: 'text' });
  });

  it('reads anything else as JSON, saying what it is', () => {
    expect(shapeOf(Schema.Record(Schema.String, Schema.Number))).toEqual({
      kind: 'json',
      text: 'Record<string, number>',
    });
    expect(shapeOf(Schema.Tuple([Schema.String, Schema.Number]))).toEqual({
      kind: 'json',
      text: '[string, number]',
    });
    expect(
      shapeOf(
        Schema.Union([
          Schema.Struct({ a: Schema.String }),
          Schema.Struct({ b: Schema.Number }),
        ]),
      ),
    ).toEqual({ kind: 'json', text: '{ a: string } | { b: number }' });
    expect(shapeOf(Schema.Array(Schema.NullOr(Schema.Number)))).toEqual({
      kind: 'array',
      of: { kind: 'json', text: 'number | null' },
    });
    expect(shapeOf(Schema.Unknown)).toEqual({ kind: 'json', text: 'unknown' });
  });

  it('stops deep in a Schema that refers to itself', () => {
    interface Tree {
      readonly children: ReadonlyArray<Tree>;
    }
    const Tree: Schema.Codec<Tree> = Schema.Struct({
      children: Schema.Array(Schema.suspend(() => Tree)),
    });
    expect(textOf(shapeOf(Tree))).toBe(
      '{ children: { children: { children }[] }[] }',
    );
    expect(JSON.stringify(shapeOf(Tree))).toContain('…');
  });

  it('is a Message’s payload without its tag', () => {
    expect(
      payloadOf(Schema.TaggedStruct('Bought', { name: Schema.String })),
    ).toEqual({ kind: 'struct', fields: [field('name', { kind: 'text' })] });
  });

  it('is plain JSON its own Schema takes', () => {
    const shape = shapeOf(
      Schema.Struct({
        a: Schema.optionalKey(Schema.Array(Schema.Literals(['x', 'y']))),
      }),
    );
    const encoded = Schema.encodeSync(Shape)(shape);
    expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
  });
});
