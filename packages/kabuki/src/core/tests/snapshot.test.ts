import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Actor, Address, History, Runtime, Snapshot } from '../index.ts';
import type { Entry, Moment } from '../index.ts';
import { Counter, run } from './fixtures.ts';

/*
 * A Snapshot: the app as data, right after one entry. Each Instance knows
 * the entry that started it and the last that changed it, and an
 * Instance's Trail is its story along the History.
 */

const Shelf = Actor.define('Shelf', {
  model: Schema.Struct({ open: Schema.Boolean, title: Schema.String }),
  message: Schema.TaggedUnion({
    Opened: {},
    Closed: {},
    Retitled: { title: Schema.String },
  }),
}).build({
  init: () => ({ model: { open: false, title: '' } }),
  children: {
    counter: Actor.child(Counter, { while: ({ model }) => model.open }),
  },
  on: {
    Opened: (_, { model }) => ({ model: { ...model, open: true } }),
    Closed: (_, { model }) => ({ model: { ...model, open: false } }),
    Retitled: ({ title }, { model }) => ({ model: { ...model, title } }),
  },
});

const COUNTER = Address.check(Shelf, 'Shelf/counter#1')!;

/** A History of Messages to the Shelf and its Counter, played. */
const story = (
  ...sends: ReadonlyArray<
    readonly [Address, { readonly _tag: string; readonly title?: string }]
  >
) =>
  sends.reduce(
    (history, [to, message]) =>
      History.add(history, { to, message, from: { kind: 'outside' }, at: 0 })
        .history,
    History.make(),
  );

const ROOT = Snapshot.init(Shelf).root.address;

describe('started and changed', () => {
  it('are null at init', () => {
    const { root, entry } = Snapshot.init(Shelf);
    expect(entry).toBe(null);
    expect(root).toMatchObject({ started: null, changed: null });
  });

  it('are set by play: the entry that started an Instance, and the last that changed it', () => {
    const history = story(
      [ROOT, { _tag: 'Opened' }],
      [COUNTER, { _tag: 'Bumped' }],
      [ROOT, { _tag: 'Retitled', title: 'mine' }],
    );
    const snapshot = Snapshot.replay(Shelf, history);
    expect(snapshot.entry).toBe(2);
    expect(snapshot.root).toMatchObject({ started: null, changed: 2 });
    expect(Snapshot.at(snapshot, COUNTER)).toMatchObject({
      started: 0,
      changed: 1,
    });
    // An entry that changes nothing changes no `changed`.
    const quiet = story([ROOT, { _tag: 'Closed' }]);
    expect(Snapshot.replay(Shelf, quiet).root.changed).toBe(null);
  });

  it('play says what came of an entry, and keeps the tree when nothing changed', () => {
    const first = Snapshot.init(Shelf);
    const entry = (
      message: { readonly _tag: string },
      to: Address = ROOT,
    ): Entry => ({
      id: 7,
      parent: null,
      to,
      message,
      from: { kind: 'outside' },
      at: 0,
    });
    const handled = Snapshot.play(Shelf, first, entry({ _tag: 'Opened' }));
    expect(handled.outcome).toBe('handled');
    expect(handled.snapshot.entry).toBe(7);
    const dropped = Snapshot.play(
      Shelf,
      first,
      entry({ _tag: 'Bumped' }, COUNTER),
    );
    expect(dropped.outcome).toBe('dropped');
    expect(dropped.snapshot.root).toBe(first.root);
    expect(dropped.snapshot.entry).toBe(7);
  });
});

describe('a Trail', () => {
  const kinds = (moments: ReadonlyArray<Moment>) =>
    moments.map(({ entry, kind }) => `${entry?.id ?? 'init'} ${kind}`);

  it('tells when an Instance started, received, changed and stopped', () => {
    const history = story(
      [ROOT, { _tag: 'Opened' }],
      [COUNTER, { _tag: 'Bumped' }],
      [ROOT, { _tag: 'Retitled', title: 'x' }],
      [ROOT, { _tag: 'Closed' }],
      [ROOT, { _tag: 'Opened' }],
    );
    const trail = Snapshot.trail(Shelf, history, COUNTER);
    expect(kinds(trail)).toEqual(['0 started', '1 changed', '3 stopped']);
    expect(trail[0]!.after?.model).toEqual({ count: 0 });
    expect(trail[1]!.before?.model).toEqual({ count: 0 });
    expect(trail[1]!.after?.model).toEqual({ count: 1 });
    expect(trail[2]!.before?.model).toEqual({ count: 1 });
    expect(trail[2]!.after).toBeUndefined();
    // The Counter Invoked again is another Instance, with its own Trail.
    expect(
      kinds(
        Snapshot.trail(
          Shelf,
          history,
          Address.check(Shelf, 'Shelf/counter#2')!,
        ),
      ),
    ).toEqual(['4 started']);
  });

  it('starts at init for an Instance there since, and tells a Message that changed nothing', () => {
    const history = story(
      [ROOT, { _tag: 'Closed' }],
      [ROOT, { _tag: 'Retitled', title: 'x' }],
    );
    const trail = Snapshot.trail(Shelf, history, ROOT);
    expect(kinds(trail)).toEqual(['init started', '0 received', '1 changed']);
    expect(trail[0]!.entry).toBe(null);
    expect(trail[1]!.before).toBe(trail[1]!.after);
  });

  it('is read up to any Step, as a Seek gives it', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.scoped(Shelf);
        app.send(app.snapshot.root.address, { _tag: 'Opened' });
        app.send(COUNTER, { _tag: 'Bumped' });
        app.send(COUNTER, { _tag: 'Bumped' });
        expect(kinds(Snapshot.trail(Shelf, app.history, COUNTER))).toEqual([
          '0 started',
          '1 changed',
          '2 changed',
        ]);
        const step = app.seek(1);
        expect(
          kinds(Snapshot.trail(Shelf, app.history, COUNTER, step.entry)),
        ).toEqual(['0 started', '1 changed']);
        expect(Snapshot.at(step.snapshot, COUNTER)?.model).toEqual({
          count: 1,
        });
        expect(Snapshot.at(app.seek(null).snapshot, COUNTER)).toBeUndefined();
        expect(Snapshot.trail(Shelf, app.history, COUNTER, null)).toEqual([]);
      }),
    ));
});
