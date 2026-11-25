import { describe, expect, it } from 'vitest';
import {
  draftOf,
  inputOf,
  providerOf,
  readableKey,
  valueOf,
} from '../logic/shared/index.ts';
import type { Card, Draft } from '../logic/shared/index.ts';
import type {
  BlueprintNode,
  Field,
  Level,
  Shape,
} from '../../services/kabuki-session/contract/index.ts';

const level = (provides: ReadonlyArray<string> = []): Level => ({
  messages: [],
  workers: [],
  children: [],
  queries: [],
  provides,
});

const print = (
  place: string,
  options: {
    readonly top?: ReadonlyArray<string>;
    readonly states?: Readonly<Record<string, ReadonlyArray<string>>>;
    readonly within?: string;
    readonly requires?: ReadonlyArray<string>;
    readonly children?: ReadonlyArray<BlueprintNode>;
  } = {},
): BlueprintNode => ({
  place,
  slot: place.includes('/') ? place.split(/[/:]/).at(-1)! : null,
  actor: place.split(/[/:]/).at(-1)!,
  condition: place.includes('/') ? 'always' : null,
  keyed: false,
  within: options.within ?? null,
  single: false,
  requires: options.requires ?? [],
  model: { kind: 'struct', fields: [] },
  top: level(options.top),
  states: Object.fromEntries(
    Object.entries(options.states ?? {}).map(([tag, gives]) => [
      tag,
      { ...level(gives), data: { kind: 'struct', fields: [] } },
    ]),
  ),
  children: options.children ?? [],
});

const card = (print: BlueprintNode): Card => ({
  id: print.place,
  name: print.slot ?? print.actor,
  print,
  state: null,
  change: null,
  children: print.children.map(card),
});

describe('who provides a Capability to a card', () => {
  it('is the parent that Provides it in the State the card is placed in, with no State current', () => {
    const root = card(
      print('App', {
        states: { Inside: ['Session'], SignedOut: [] },
        children: [
          print('App/Inside:home', { within: 'Inside', requires: ['Session'] }),
        ],
      }),
    );
    expect(providerOf(root, 'App/Inside:home', 'Session')).toBe('App');
  });

  it('is not a parent that Provides it only in another State', () => {
    const root = card(
      print('App', {
        states: { Inside: ['Session'], SignedOut: [] },
        children: [print('App/SignedOut:away', { within: 'SignedOut' })],
      }),
    );
    expect(providerOf(root, 'App/SignedOut:away', 'Session')).toBeUndefined();
  });

  it("reaches a Child at the top only from its parent's top", () => {
    const root = card(
      print('App', {
        top: ['Clock'],
        states: { Inside: ['Session'] },
        children: [print('App/bar')],
      }),
    );
    expect(providerOf(root, 'App/bar', 'Clock')).toBe('App');
    expect(providerOf(root, 'App/bar', 'Session')).toBeUndefined();
  });

  it('is the nearest above, past a parent that does not Provide it', () => {
    const root = card(
      print('App', {
        states: { Inside: ['Session'] },
        children: [
          print('App/Inside:downloads', {
            within: 'Inside',
            children: [print('App/Inside:downloads/files')],
          }),
        ],
      }),
    );
    expect(providerOf(root, 'App/Inside:downloads/files', 'Session')).toBe(
      'App',
    );
  });
});

const field = (
  name: string,
  shape: Shape,
  more: { readonly optional?: boolean; readonly nullable?: boolean } = {},
): Field => ({
  name,
  optional: more.optional ?? false,
  nullable: more.nullable ?? false,
  shape,
});

const struct = (...fields: ReadonlyArray<Field>): Shape => ({
  kind: 'struct',
  fields,
});

describe('a form, from a Shape', () => {
  const payload = struct(
    field('text', { kind: 'text' }),
    field('count', { kind: 'number' }),
    field('on', { kind: 'boolean' }),
    field('color', { kind: 'choice', options: ['red', 'blue', 3] }),
    field('note', struct(field('at', { kind: 'text' }))),
    field('tags', { kind: 'array', of: { kind: 'text' } }),
    field('extra', { kind: 'json', text: 'Record<string, number>' }),
  );

  it('has an input for each kind: text, number, switch, choice, nested fields, else JSON', () => {
    expect(inputOf(payload)).toEqual({
      kind: 'group',
      fields: [
        expect.objectContaining({ name: 'text', input: { kind: 'text' } }),
        expect.objectContaining({ name: 'count', input: { kind: 'number' } }),
        expect.objectContaining({ name: 'on', input: { kind: 'switch' } }),
        expect.objectContaining({
          name: 'color',
          input: { kind: 'choice', options: ['red', 'blue', 3] },
        }),
        expect.objectContaining({
          name: 'note',
          input: {
            kind: 'group',
            fields: [expect.objectContaining({ name: 'at' })],
          },
        }),
        expect.objectContaining({
          name: 'tags',
          input: { kind: 'json', hint: 'string[]' },
        }),
        expect.objectContaining({
          name: 'extra',
          input: { kind: 'json', hint: 'Record<string, number>' },
        }),
      ],
    });
  });

  it('starts blank, a switch off', () => {
    expect(draftOf(inputOf(payload))).toEqual({
      text: '',
      count: '',
      on: false,
      color: '',
      note: { at: '' },
      tags: '',
      extra: '',
    });
  });

  it('builds the payload from what is filled in, each kind as its value', () => {
    const draft: Draft = {
      text: 'hi',
      count: ' 4.5 ',
      on: true,
      color: '2',
      note: { at: '2026-11-25' },
      tags: '["a", "b"]',
      extra: '{"x": 1}',
    };
    expect(valueOf(inputOf(payload), draft)).toEqual({
      _tag: 'Built',
      value: {
        text: 'hi',
        count: 4.5,
        on: true,
        color: 3,
        note: { at: '2026-11-25' },
        tags: ['a', 'b'],
        extra: { x: 1 },
      },
    });
  });

  it('says what is wrong, by the path of each field', () => {
    const built = valueOf(inputOf(payload), {
      ...(draftOf(inputOf(payload)) as Record<string, Draft>),
      count: 'four',
      extra: '{',
    });
    expect(built).toEqual({
      _tag: 'Unbuilt',
      problems: [
        { path: 'count', problem: 'Not a number' },
        { path: 'color', problem: 'Pick one' },
        { path: 'tags', problem: 'Write JSON' },
        { path: 'extra', problem: 'Not JSON' },
      ],
    });
  });

  it('leaves a blank optional field out, and makes a blank nullable one null', () => {
    const input = inputOf(
      struct(
        field('seats', { kind: 'number' }, { optional: true }),
        field('owner', { kind: 'text' }, { nullable: true }),
        field(
          'color',
          { kind: 'choice', options: ['red'] },
          { optional: true, nullable: true },
        ),
        field('name', { kind: 'text' }),
      ),
    );
    expect(valueOf(input, draftOf(input))).toEqual({
      _tag: 'Built',
      value: { owner: null, name: '' },
    });
    expect(
      valueOf(input, { seats: '2', owner: 'ada', color: '0', name: 'x' }),
    ).toEqual({
      _tag: 'Built',
      value: { seats: 2, owner: 'ada', color: 'red', name: 'x' },
    });
  });
});

describe('a card key, made readable', () => {
  it('shows a UUID by its first eight', () => {
    expect(readableKey('2c93ede4-1c66-421b-8f2a-0123456789ab')).toBe(
      '2c93ede4',
    );
  });

  it('keeps a short id whole', () => {
    expect(readableKey('DTaTKRJUMmHSYCccaaCt')).toBe('DTaTKRJUMmHSYCccaaCt');
  });

  it('shows a long id by its start and end', () => {
    expect(readableKey('local_ZGV2QGtlc3RhY2sudGVzdA_more')).toBe(
      'local_ZGV2…zdA_more',
    );
  });

  it('shows a list of ids by its parts, in order', () => {
    expect(
      readableKey(
        JSON.stringify([
          '2c93ede4-1c66-421b-8f2a-0123456789ab',
          'a1b2c3d4-0000-4000-8000-000000000000',
        ]),
      ),
    ).toBe('2c93ede4 / a1b2c3d4');
  });
});
