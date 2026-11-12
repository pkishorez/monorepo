import { Schema } from 'effect';
import { expectTypeOf } from 'vitest';
import { Actor, Runtime, Snapshot } from '../index.ts';
import type { Address, Instance, Moment, Step } from '../index.ts';

/*
 * A Snapshot typed by its root's Actor: each Instance's State, Model and
 * Props are its Actor's, each Child is its own Actor's Instance, and an
 * Address taken from it Sends only that Actor's Messages. Untyped, it is
 * any Actor's, and a typed one is one of those.
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
const { root } = runtime.snapshot;

// The root carries its Actor's data.
expectTypeOf(root).toEqualTypeOf<Instance<App>>();
expectTypeOf(root.actor).toEqualTypeOf<'App'>();
expectTypeOf(root.address).toEqualTypeOf<Address<App>>();
expectTypeOf(root.model).toEqualTypeOf<{ readonly lit: boolean }>();
expectTypeOf(root.state).toEqualTypeOf<
  | { readonly _tag: 'Outside' }
  | { readonly _tag: 'Inside'; readonly since: number }
>();
// No Props declared: there are none.
expectTypeOf(root.props).toEqualTypeOf<undefined>();

// A Child always there, one there `while` a test holds, and one written in a State.
expectTypeOf(root.children.header).toEqualTypeOf<Instance<Light>>();
expectTypeOf(root.children.light).toEqualTypeOf<Instance<Light> | undefined>();
expectTypeOf(root.children.downloads).toEqualTypeOf<
  Instance<Downloads> | undefined
>();
expectTypeOf<keyof typeof root.children>().toEqualTypeOf<
  'header' | 'light' | 'downloads'
>();

// The Children of an `each`, a list, each with its Actor's Props.
const downloads = root.children.downloads!;
expectTypeOf(downloads.children.files).toEqualTypeOf<
  ReadonlyArray<Instance<File>>
>();
const file = downloads.children.files[0]!;
expectTypeOf(file.address).toEqualTypeOf<Address<File>>();
expectTypeOf(file.props).toEqualTypeOf<
  { readonly selected: boolean } | undefined
>();

// An Address from the Snapshot Sends only its Actor's Messages.
runtime.send(root.address, { _tag: 'Entered' });
runtime.send(downloads.address, { _tag: 'Set', ids: ['a'] });
runtime.send(file.address, { _tag: 'Opened' });
// @ts-expect-error: a File takes no `Set`
runtime.send(file.address, { _tag: 'Set', ids: [] });
// @ts-expect-error: the root takes no `Opened`
runtime.send(root.address, { _tag: 'Opened' });

// Found by Address, it is that Address's Actor's.
expectTypeOf(Snapshot.at(runtime.snapshot, file.address)).toEqualTypeOf<
  Instance<File> | undefined
>();
declare const step: Step<App>;
expectTypeOf(step.snapshot).toEqualTypeOf<Snapshot<App>>();
expectTypeOf(Snapshot.at(step.snapshot, downloads.address)).toEqualTypeOf<
  Instance<Downloads> | undefined
>();
expectTypeOf(
  Snapshot.trail(App, runtime.history, file.address, step.entry),
).toEqualTypeOf<ReadonlyArray<Moment<File>>>();
expectTypeOf(Snapshot.init(App)).toEqualTypeOf<Snapshot<App>>();

// Untyped, it is any Actor's: what tools read.
const any: Instance = root;
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
