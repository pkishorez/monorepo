import { Context, Schema } from 'effect';
import { expectTypeOf } from 'vitest';
import { Actor } from '../index.ts';
import type { Needs } from '../runtime/index.ts';
import type { BehaviorOf, Types } from '../actor/index.ts';

class Clock2 extends Context.Service<Clock2, { readonly now: number }>()(
  'Clock2',
) {}

const Row = Actor.define('Row', {
  requires: [Clock2],
  input: { text: Schema.String },
  props: { selected: Schema.Boolean },
  model: { text: Schema.String },
  emits: { Remove: {}, Rename: { to: Schema.String } },
});
const RowLive = Row.build({ init: ({ text }) => ({ model: { text } }) });

const Bare = Actor.define('Bare', { model: { n: Schema.Number } });
const BareLive = Bare.build({ init: () => ({ model: { n: 0 } }) });

const List = Actor.define('List', {
  state: { Closed: {}, Open: { user: Schema.String } },
  model: { ids: Schema.Array(Schema.String), picked: Schema.String },
  message: {
    Removed: { id: Schema.String },
    Renamed: { id: Schema.String, to: Schema.String },
  },
});

export const Good = List.build({
  init: () => ({ model: { ids: [], picked: '' }, state: { _tag: 'Closed' } }),
  children: {
    rows: Actor.child(RowLive, {
      each: ({ model }) => model.ids,
      input: (_, id) => ({ text: id }),
      props: ({ model }, id) => ({ selected: model.picked === id }),
      emits: {
        Remove: (_, id) => ({ _tag: 'Removed', id }),
        Rename: (event, id) => {
          expectTypeOf(event).toEqualTypeOf<{
            readonly _tag: 'Rename';
            readonly to: string;
          }>();
          return { _tag: 'Renamed', id, to: event.to };
        },
      },
    }),
    bare: Actor.child(BareLive),
  },
  on: { Removed: () => ({}), Renamed: () => ({}) },
  states: {
    Open: {
      children: {
        mine: Actor.child(RowLive, {
          while: ({ state }) => state.user !== '',
          input: ({ state }) => ({ text: state.user }),
          props: () => ({ selected: true }),
        }),
      },
    },
  },
});

// The View's Children: a list for `each`, maybe absent for `while`, one for always.
type Kids = Types<typeof Good>['children'];
expectTypeOf<Kids['Closed']>().toHaveProperty('rows');
expectTypeOf<keyof Kids['Closed']>().toEqualTypeOf<'rows' | 'bare'>();
expectTypeOf<keyof Kids['Open']>().toEqualTypeOf<'rows' | 'bare' | 'mine'>();
expectTypeOf<Kids['Open']['mine']>().toHaveProperty('while');
expectTypeOf<Kids['Open']['rows']>().toHaveProperty('each');
// A Child's needs bubble up.
expectTypeOf<Needs<typeof Good>>().toEqualTypeOf<Clock2>();

List.build({
  init: () => ({ model: { ids: [], picked: '' }, state: { _tag: 'Closed' } }),
  children: {
    a: Actor.child(RowLive, {
      input: () => ({ text: '' }),
      // @ts-expect-error props of the wrong type
      props: () => ({ selected: 'yes' }),
    }),
    // @ts-expect-error props left out though the Row declares them
    b: Actor.child(RowLive, { input: () => ({ text: '' }) }),
    // @ts-expect-error input left out though the Row declares it
    c: Actor.child(RowLive, { props: () => ({ selected: true }) }),
    // @ts-expect-error options left out entirely
    d: Actor.child(RowLive),
    e: Actor.child(RowLive, {
      input: () => ({ text: '' }),
      props: () => ({ selected: true }),
      // @ts-expect-error an Emit the Row does not have
      emits: { Nope: () => ({ _tag: 'Removed', id: '' }) },
    }),
    f: Actor.child(RowLive, {
      input: () => ({ text: '' }),
      props: () => ({ selected: true }),
      // @ts-expect-error turned into a Message the List does not have
      emits: { Remove: () => ({ _tag: 'Nope' }) },
    }),
    g: Actor.child(RowLive, {
      // @ts-expect-error the data is the List's: no such field
      input: ({ model }) => ({ text: model.missing }),
      props: () => ({ selected: true }),
    }),
    h: Actor.child(RowLive, {
      // @ts-expect-error at the top the State is not narrowed: no `user` in Closed
      input: ({ state }) => ({ text: state.user }),
      props: () => ({ selected: true }),
    }),
  },
  on: { Removed: () => ({}), Renamed: () => ({}) },
  states: {
    Closed: {
      children: {
        i: Actor.child(RowLive, {
          // @ts-expect-error in Closed's block there is no `user`
          input: ({ state }) => ({ text: state.user }),
          props: () => ({ selected: true }),
        }),
      },
    },
  },
});

// A parent with no Messages hears nothing.
const Quiet = Actor.define('Quiet', {});
Quiet.build({
  children: {
    bare: Actor.child(BareLive),
    row: Actor.child(RowLive, {
      input: () => ({ text: '' }),
      props: () => ({ selected: true }),
      // @ts-expect-error a parent with no Messages has nothing to turn an Emit into
      emits: { Remove: () => ({ _tag: 'Removed', id: '' }) },
    }),
  },
});

// A Child written by hand skips `Actor.child`, and every check with it.
List.build({
  init: () => ({ model: { ids: [], picked: '' }, state: { _tag: 'Closed' } }),
  // @ts-expect-error a Child is made with `Actor.child`
  children: { byHand: { actor: RowLive } },
  on: { Removed: () => ({}), Renamed: () => ({}) },
});

// A Child made away from any level is typed by nothing, so one that Emits
// fits no parent; one that Emits nothing fits any.
const loose = Actor.child(RowLive, {
  input: () => ({ text: '' }),
  props: () => ({ selected: true }),
  emits: { Remove: () => ({ _tag: 'Wrong' }) },
});
const quiet = Actor.child(BareLive);
List.build({
  init: () => ({ model: { ids: [], picked: '' }, state: { _tag: 'Closed' } }),
  // @ts-expect-error its Emits are not checked against the List's Messages
  children: { loose },
  on: { Removed: () => ({}), Renamed: () => ({}) },
});
List.build({
  init: () => ({ model: { ids: [], picked: '' }, state: { _tag: 'Closed' } }),
  children: { quiet },
  on: { Removed: () => ({}), Renamed: () => ({}) },
});

// State blocks written apart, their keys optional, declare no Query.
const blocks: NonNullable<BehaviorOf<typeof List>['states']> = {
  Open: { on: { Removed: () => ({}) } },
};
List.build({
  init: () => ({ model: { ids: [], picked: '' }, state: { _tag: 'Closed' } }),
  on: { Removed: () => ({}), Renamed: () => ({}) },
  states: blocks,
});
