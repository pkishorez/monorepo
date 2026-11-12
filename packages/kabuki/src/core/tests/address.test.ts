import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Actor, Address, Blueprint, Runtime, Snapshot } from '../index.ts';
import type { Instance } from '../index.ts';
import { Counter, run } from './fixtures.ts';

/*
 * The Address: one path from the root, the State a Child is written in, its
 * slot, its key and its count; and, without keys and counts, its place in
 * the root's Blueprint.
 */

const File = Actor.define('File', {
  message: Schema.TaggedUnion({ Opened: {} }),
}).build({ on: { Opened: () => ({}) } });

const Downloads = Actor.define('Downloads', {
  model: Schema.Struct({ ids: Schema.Array(Schema.String) }),
  message: Schema.TaggedUnion({ Set: { ids: Schema.Array(Schema.String) } }),
}).build({
  init: () => ({ model: { ids: ['3', 'a b'] } }),
  children: {
    files: Actor.child(File, { each: ({ model }) => model.ids }),
  },
  on: { Set: ({ ids }) => ({ model: { ids } }) },
});

const App = Actor.define('App', {
  state: Schema.TaggedUnion({ Outside: {}, Inside: {} }),
  message: Schema.TaggedUnion({ Entered: {}, Left: {} }),
}).build({
  init: () => ({ state: { _tag: 'Inside' } }),
  children: { counter: Actor.child(Counter) },
  states: {
    Outside: { on: { Entered: () => ({ state: { _tag: 'Inside' } }) } },
    Inside: {
      children: { downloads: Actor.child(Downloads) },
      on: { Left: () => ({ state: { _tag: 'Outside' } }) },
    },
  },
});

const addresses = (instance: Instance): ReadonlyArray<string> => [
  instance.address,
  ...Object.values(instance.children).flatMap((held) =>
    (Snapshot.isMany(held) ? held : [held]).flatMap(addresses),
  ),
];

describe('an Address', () => {
  it('names the State a Child is written in, its key and its count', () => {
    expect(addresses(Snapshot.init(App).root)).toEqual([
      'App',
      'App/counter#1',
      'App/Inside:downloads#1',
      'App/Inside:downloads#1/files[3]#1',
      'App/Inside:downloads#1/files[a%20b]#1',
    ]);
  });

  it('is new for a Child Invoked again, and the same for one kept', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(App);
        const root = app.snapshot.root.address;
        app.send(root, { _tag: 'Left' });
        app.send(root, { _tag: 'Entered' });
        expect(addresses(app.snapshot.root)).toEqual([
          'App',
          'App/counter#1',
          'App/Inside:downloads#2',
          'App/Inside:downloads#2/files[3]#1',
          'App/Inside:downloads#2/files[a%20b]#1',
        ]);
        const downloads = Address.check(App, 'App/Inside:downloads#2')!;
        app.send(downloads, { _tag: 'Set', ids: ['3'] });
        app.send(downloads, { _tag: 'Set', ids: ['3', 'a b'] });
        expect(addresses(app.snapshot.root).slice(3)).toEqual([
          'App/Inside:downloads#2/files[3]#1',
          'App/Inside:downloads#2/files[a%20b]#2',
        ]);
      }),
    ));
});

describe('Address', () => {
  const file = Address.check(App, 'App/Inside:downloads#2/files[a%20b]#1')!;

  it('parses into the root and one segment per Child, its key decoded', () => {
    expect(Address.parse(file)).toEqual({
      root: 'App',
      path: [
        { state: 'Inside', slot: 'downloads', n: 2 },
        { slot: 'files', key: 'a b', n: 1 },
      ],
    });
    expect(Address.parse(Address.check(App, 'App')!)).toEqual({
      root: 'App',
      path: [],
    });
  });

  it('gives its parent, and none for the root', () => {
    expect(Address.parent(file)).toBe('App/Inside:downloads#2');
    expect(Address.parent(Address.parent(file)!)).toBe('App');
    expect(Address.parent(Address.check(App, 'App')!)).toBeUndefined();
  });

  it('gives its place in the Blueprint, which finds the Child’s', () => {
    expect(Address.place(file)).toBe('App/Inside:downloads/files');
    expect(Address.place(Address.check(App, 'App/counter#4')!)).toBe(
      'App/counter',
    );
    expect(Blueprint.at(App.blueprint, Address.place(file))?.name).toBe('File');
  });

  it('tells what is within another', () => {
    const downloads = Address.parent(file)!;
    expect(Address.within(downloads, file)).toBe(true);
    expect(Address.within(downloads, downloads)).toBe(true);
    expect(Address.within(file, downloads)).toBe(false);
    expect(
      Address.within(
        Address.check(App, 'App/Inside:downloads#1')!,
        Address.check(App, 'App/Inside:downloads#12')!,
      ),
    ).toBe(false);
  });

  it('checks text against the Blueprint: every slot where it is written, a key exactly when it is held under one', () => {
    expect(Address.check(App, 'App')).toBe('App');
    expect(Address.check(App, 'App/counter#1')).toBe('App/counter#1');
    expect(Address.check(App, 'App/Inside:downloads#3/files[x]#9')).toBe(
      'App/Inside:downloads#3/files[x]#9',
    );
    // Wrong root, a top-level Child said to be in a State, a State's Child
    // written as if at the top or in another State.
    expect(Address.check(App, 'Other/counter#1')).toBeUndefined();
    expect(Address.check(App, 'App/Inside:counter#1')).toBeUndefined();
    expect(Address.check(App, 'App/downloads#1')).toBeUndefined();
    expect(Address.check(App, 'App/Outside:downloads#1')).toBeUndefined();
    // A key where none is held, none where one is, and no count.
    expect(Address.check(App, 'App/counter[a]#1')).toBeUndefined();
    expect(
      Address.check(App, 'App/Inside:downloads#1/files#1'),
    ).toBeUndefined();
    expect(Address.check(App, 'App/counter')).toBeUndefined();
    expect(Address.check(App, 'App/counter#0')).toBeUndefined();
  });
});

describe('Sending to an Address', () => {
  it('is typed by the Actor an Address taken from a Snapshot carries', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(App);
        const root = app.snapshot.root.address;
        expectTypeOf(root).toEqualTypeOf<Address<typeof App>>();
        expect(app.send(root, { _tag: 'Left' })).toBe('handled');
        // @ts-expect-error not one of App's Messages
        expect(() => app.send(root, { _tag: 'Opened' })).toThrow(
          /does not match its Schema/,
        );
        // @ts-expect-error a string is not an Address: it goes through `Address.check`
        expect(app.send('App', { _tag: 'Left' })).toBe('ignored');
        // One checked by hand is of no Actor in particular: any tagged Message.
        const counter = Address.check(App, 'App/counter#1')!;
        expect(app.send(counter, { _tag: 'Bumped' })).toBe('handled');
      }),
    ));
});
