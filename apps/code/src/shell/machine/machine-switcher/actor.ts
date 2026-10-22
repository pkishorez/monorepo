import { Effect, Schema } from 'effect';
import { Machine } from '@kestack/ai-toolkit/machines';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { home } from '../../../places/index.ts';
import * as Picker from '../../../ui/picker/index.ts';
import { ago } from '../../../ui/time/index.ts';
import { DOWN_AFTER, Machines } from '../../machines/index.ts';

/*
 * The Machine Switcher: the signed-in Account's Machines, in place of the
 * logo, the one the app is on checked.
 *
 * 1. Read    the Machines the Machine page holds, each with when it was
 *            last seen: those online by name, so the rows hold still as
 *            Heartbeats come in, then the rest the most recently seen
 *            first; opening it asks the Backend again.
 * 2. Pick    another Machine goes to its home: a new Machine page, with
 *            its own socket and records. The one open changes nothing.
 */

/** Online Machines by name, then the rest the most recently seen first. */
const byPlace =
  (now: number) => (a: typeof Machine.Type, b: typeof Machine.Type) => {
    const online = (each: typeof Machine.Type) =>
      now - each.lastSeen <= DOWN_AFTER;
    if (online(a) !== online(b)) return online(a) ? -1 : 1;
    return online(a) ? a.name.localeCompare(b.name) : b.lastSeen - a.lastSeen;
  };

const Machines_ = Picker.make('MachineSwitcher', {
  props: Schema.Struct({
    machines: Schema.NullOr(Schema.Array(Machine)),
    on: Schema.String,
    now: Schema.Number,
  }),
  steps: {
    machine: {
      placeholder: () => 'Search machines',
      empty: () => 'No machine by that name',
      rows: ({ props }) => ({
        rows: [...(props.machines ?? [])]
          .sort(byPlace(props.now))
          .map((each) => ({
            value: each.id,
            label: each.name,
            hint:
              props.now - each.lastSeen > DOWN_AFTER
                ? `Last seen ${ago(each.lastSeen, props.now)}`
                : 'Online',
            checked: each.id === props.on,
          })),
        loading: props.machines === null,
      }),
    },
  },
  lands: () => true,
});

export const MachineSwitcher = Actor.define('MachineSwitcher', {
  requires: [Navigation, Machines],
  props: Schema.Struct({
    machines: Schema.NullOr(Schema.Array(Machine)),
    on: Schema.String,
  }),
  model: Schema.Struct({
    picking: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
    /** When it was opened, by the real clock, for each Last Seen. */
    now: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    Open: { how: Picker.How, now: Schema.Number },
    Closed: {},
    Chose: { machineId: Schema.String },
  }),
});

export const MachineSwitcherLive = Actor.build(MachineSwitcher, {
  init: () => ({ model: { picking: null, opened: 0, now: 0 } }),
  children: {
    picker: {
      actor: Machines_.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: { id: 'machine', key: '' },
        choices: [],
      }),
      props: ({ model, props }) => ({
        machines: props.machines,
        on: props.on,
        now: model.now,
      }),
    },
  },
  provides: (self) =>
    Machines_.owner({
      done: (choices) => {
        const chosen = choices?.at(-1)?.value;
        return self.send(
          chosen === undefined
            ? { _tag: 'Closed' }
            : { _tag: 'Chose', machineId: chosen },
        );
      },
    }),
  workers: {
    // 1. Read: the list is asked again as it opens.
    refresh: {
      while: ({ model }) => model.picking !== null,
      run: () => Effect.flatMap(Machines, ({ refresh }) => refresh),
    },
  },
  on: {
    Open: ({ how, now }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: { picking: how, opened: model.opened + 1, now },
          },
    Closed: (_, { model }) => ({ model: { ...model, picking: null } }),
    // 2. Pick
    Chose: ({ machineId }, { model, props }) => ({
      model: { ...model, picking: null },
      ...(machineId === props.on
        ? {}
        : { command: Router.push(home(machineId)) }),
    }),
  },
});

export const MachinesView = Machines_.View;
