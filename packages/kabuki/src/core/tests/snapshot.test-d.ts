import { Schema } from 'effect';
import { expectTypeOf } from 'vitest';
import { Actor, History, Runtime, Snapshot } from '../index.ts';
import type { Address } from '../index.ts';
import type {
  Entry,
  HistoryEntry,
  Instance,
  LiveInstance,
  SavedSnapshot,
} from '../types.ts';

/*
 * A Snapshot typed by its root's Actor: each Instance's State, Model and
 * Props are its Actor's, each Child is its own Actor's Instance, and an
 * Address taken from it Sends only that Actor's Messages. An Instance is
 * one of its States: a check on `_tag` narrows its State and the Children
 * it holds together. Untyped, it is any Actor's, and a typed one is one of
 * those.
 */

const File = Actor.define('File', {
  props: { selected: Schema.Boolean },
  message: { Opened: {} },
}).build({ on: { Opened: () => ({}) } });

const Downloads = Actor.define('Downloads', {
  model: { ids: Schema.Array(Schema.String) },
  message: { Set: { ids: Schema.Array(Schema.String) } },
}).build({
  init: () => ({ model: { ids: [] } }),
  children: {
    files: Actor.child(File, {
      each: ({ model }) => model.ids,
      props: () => ({ selected: false }),
    }),
  },
  on: { Set: ({ ids }) => ({ model: { ids } }) },
});

const Light = Actor.define('Light', { model: { on: Schema.Boolean } }).build({
  init: () => ({ model: { on: false } }),
});

const App = Actor.define('App', {
  model: { lit: Schema.Boolean },
  state: { Outside: {}, Inside: { since: Schema.Number } },
  message: { Entered: {}, Left: {} },
}).build({
  init: () => ({ model: { lit: false }, state: { _tag: 'Outside' } }),
  children: {
    light: Actor.child(Light, { while: ({ model }) => model.lit }),
    header: Actor.child(Light),
  },
  states: {
    Outside: {
      on: {
        Entered: (_, { at }) => ({ state: { _tag: 'Inside', since: at } }),
      },
    },
    Inside: {
      children: { downloads: Actor.child(Downloads) },
      on: { Left: () => ({ state: { _tag: 'Outside' } }) },
    },
  },
});

type App = typeof App;
type Downloads = typeof Downloads;
type File = typeof File;
type Light = typeof Light;

declare const runtime: Runtime<App>;
declare const history: History;
const { root } = runtime.snapshot;

// The root carries its Actor's data.
expectTypeOf(root).toEqualTypeOf<Instance<App>>();
expectTypeOf(root.actor).toEqualTypeOf<'App'>();
expectTypeOf(root.address).toEqualTypeOf<Address<App>>();
expectTypeOf(root.model).toEqualTypeOf<{ readonly lit: boolean }>();
expectTypeOf(root.invoked).toEqualTypeOf<Readonly<Record<string, number>>>();
// Held under no key that its type knows of.
expectTypeOf(root.key).toEqualTypeOf<string | undefined>();
// No Props declared: there are none.
expectTypeOf(root.props).toEqualTypeOf<undefined>();
// The Time is the Snapshot's, not an Instance's.
expectTypeOf(runtime.snapshot.at).toEqualTypeOf<number>();
// @ts-expect-error: a Snapshot names no entry
void runtime.snapshot.entry;
// @ts-expect-error: an Instance does not know the entry that started it
void root.started;
// @ts-expect-error: nor the last that changed it
void root.changed;

// Before its State is known, it is any of them, and `_tag` repeats the State's tag.
expectTypeOf(root._tag).toEqualTypeOf<'Outside' | 'Inside'>();
expectTypeOf(root.state).toEqualTypeOf<
  | { readonly _tag: 'Outside' }
  | { readonly _tag: 'Inside'; readonly since: number }
>();
// @ts-expect-error: only Inside holds `since`
void root.state.since;

// A Child always there, and one there `while` a test holds, are read in any State.
expectTypeOf(root.children.header).toEqualTypeOf<Instance<Light>>();
expectTypeOf(root.children.light).toEqualTypeOf<Instance<Light> | undefined>();
// @ts-expect-error: a Child written only in Inside is not read before the State is known
void root.children.downloads;

// A check on `_tag` narrows the State and the Children together.
if (root._tag === 'Inside') {
  expectTypeOf(root._tag).toEqualTypeOf<'Inside'>();
  expectTypeOf(root.state).toEqualTypeOf<{
    readonly _tag: 'Inside';
    readonly since: number;
  }>();
  expectTypeOf(root.state.since).toEqualTypeOf<number>();
  // The Child its State writes is always there.
  expectTypeOf(root.children.downloads).toEqualTypeOf<Instance<Downloads>>();
  expectTypeOf<keyof typeof root.children>().toEqualTypeOf<
    'header' | 'light' | 'downloads'
  >();
  // The ones written at the top are still read.
  expectTypeOf(root.children.header).toEqualTypeOf<Instance<Light>>();
  expectTypeOf(root.children.light).toEqualTypeOf<
    Instance<Light> | undefined
  >();
  // What does not depend on the State is as it was.
  expectTypeOf(root.model).toEqualTypeOf<{ readonly lit: boolean }>();
  expectTypeOf(root.address).toEqualTypeOf<Address<App>>();
} else {
  expectTypeOf(root._tag).toEqualTypeOf<'Outside'>();
  expectTypeOf(root.state).toEqualTypeOf<{ readonly _tag: 'Outside' }>();
  expectTypeOf<keyof typeof root.children>().toEqualTypeOf<
    'header' | 'light'
  >();
  // @ts-expect-error: Outside holds no `since`
  void root.state.since;
  // @ts-expect-error: Outside writes no `downloads`
  void root.children.downloads;
}

// Narrowed, it is the State's member of the Instance, by any way of checking.
type Inside = Extract<Instance<App>, { readonly _tag: 'Inside' }>;
expectTypeOf<Inside['state']>().toEqualTypeOf<{
  readonly _tag: 'Inside';
  readonly since: number;
}>();
expectTypeOf<Inside['children']['downloads']>().toEqualTypeOf<
  Instance<Downloads>
>();
const inside = (instance: Instance<App>): instance is Inside =>
  instance._tag === 'Inside';
if (inside(root))
  expectTypeOf(root.children.downloads).toEqualTypeOf<Instance<Downloads>>();
switch (root._tag) {
  case 'Outside':
    // @ts-expect-error: Outside writes no `downloads`
    void root.children.downloads;
    break;
  case 'Inside':
    expectTypeOf(root.children.downloads.model.ids).toEqualTypeOf<
      ReadonlyArray<string>
    >();
    break;
  default:
    // Every State is checked.
    expectTypeOf(root).toEqualTypeOf<never>();
}

// An Actor of one State needs no check: its Children are read at once.
declare const downloads: Instance<Downloads>;
expectTypeOf(downloads._tag).toEqualTypeOf<'Single'>();
expectTypeOf(downloads.state).toEqualTypeOf<{ readonly _tag: 'Single' }>();

// The Children of an `each`, a list, each under its key, with its Actor's Props.
expectTypeOf(downloads.children.files).toEqualTypeOf<
  ReadonlyArray<Instance<File> & { readonly key: string }>
>();
const file = downloads.children.files[0]!;
expectTypeOf(file.key).toEqualTypeOf<string>();
expectTypeOf(file.address).toEqualTypeOf<Address<File>>();
expectTypeOf(file.props).toEqualTypeOf<
  { readonly selected: boolean } | undefined
>();

// An Address from the Snapshot reaches its Actor's live Instance, which takes only its Messages.
expectTypeOf(runtime.at(root.address)).toEqualTypeOf<
  LiveInstance<App> | undefined
>();
expectTypeOf(runtime.at(file.address)).toEqualTypeOf<
  LiveInstance<File> | undefined
>();
runtime.at(root.address)?.send({ _tag: 'Entered' });
runtime.at(downloads.address)?.send({ _tag: 'Set', ids: ['a'] });
runtime.at(file.address)?.send({ _tag: 'Opened' });
// @ts-expect-error: a File takes no `Set`
runtime.at(file.address)?.send({ _tag: 'Set', ids: [] });
// @ts-expect-error: the root takes no `Opened`
runtime.at(root.address)?.send({ _tag: 'Opened' });

// Found by Address, it is that Address's Actor's, to narrow the same way.
expectTypeOf(Snapshot.at(runtime.snapshot, file.address)).toEqualTypeOf<
  Instance<File> | undefined
>();
const found = Snapshot.at(runtime.snapshot, root.address);
expectTypeOf(found).toEqualTypeOf<Instance<App> | undefined>();
if (found?._tag === 'Inside')
  expectTypeOf(found.children.downloads).toEqualTypeOf<Instance<Downloads>>();

// Every way to a Snapshot of the root's Actor gives one typed by it.
declare const entry: Entry;
declare const saved: SavedSnapshot;
expectTypeOf(Snapshot.init(App)).toEqualTypeOf<Snapshot<App>>();
expectTypeOf(Snapshot.next(App, runtime.snapshot, entry).snapshot).toExtend<
  Snapshot<App>
>();
expectTypeOf(Snapshot.load(App, saved)).toEqualTypeOf<Snapshot<App>>();
expectTypeOf(
  Snapshot.save(App, runtime.snapshot),
).toEqualTypeOf<SavedSnapshot>();
expectTypeOf(History.snapshot(App, history)).toEqualTypeOf<Snapshot<App>>();
expectTypeOf(History.snapshot(App, history, 3)).toEqualTypeOf<Snapshot<App>>();
expectTypeOf(
  Snapshot.at(History.snapshot(App, history, null), downloads.address),
).toEqualTypeOf<Instance<Downloads> | undefined>();
// A History is of no Actor: it starts from any Snapshot, and its entries are any Instance's.
expectTypeOf(History.init(runtime.snapshot)).toEqualTypeOf<History>();
expectTypeOf(history.start).toEqualTypeOf<Snapshot>();
expectTypeOf(
  History.entries(history).filter((sent) => sent.to === file.address),
).toEqualTypeOf<Array<HistoryEntry>>();
// @ts-expect-error: an entry has an id only in a History
void entry.id;

// Untyped, it is any Actor's: what tools read.
const any: Instance = root;
expectTypeOf(any._tag).toEqualTypeOf<string>();
expectTypeOf(any.key).toEqualTypeOf<string | undefined>();
expectTypeOf(any.actor).toEqualTypeOf<string>();
expectTypeOf(any.state).toEqualTypeOf<{ readonly _tag: string }>();
expectTypeOf(any.model).toEqualTypeOf<unknown>();
expectTypeOf(any.children).toEqualTypeOf<
  Readonly<Record<string, Instance | ReadonlyArray<Instance>>>
>();
const anySnapshot: Snapshot = runtime.snapshot;
const anyRuntime: Runtime = runtime;
void anySnapshot;
void anyRuntime;
