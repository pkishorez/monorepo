import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { fork, travel } from './commands.ts';
import {
  firstOf,
  followedOf,
  nextOf,
  onBranch,
  shownOf,
} from './shared/index.ts';
import type { RunningShape } from './shared/index.ts';

export const init: InitOf<typeof RunningShape> = ({ presenting, place }) => ({
  model: {
    presenting,
    place,
    print: null,
    now: null,
    entries: [],
    branch: null,
    look: null,
    opened: [],
    closed: null,
    playing: false,
    problem: null,
  },
});

export const updates: UpdatesOf<typeof RunningShape> = {
  Printed: ({ root }) => ({ model: { print: root } }),
  Heard: ({ now, entries }, data) => {
    const { model } = data;
    const { seeking } = now;
    const off =
      typeof seeking === 'number' &&
      !onBranch({ ...data, model: { ...model, now, entries } }, seeking);
    return {
      model: {
        now,
        entries,
        branch: off ? seeking : model.branch,
        problem: null,
      },
    };
  },
  Looked: ({ look }) => ({ model: { look, problem: null } }),
  Failed: ({ problem }) => ({ model: { problem } }),
  Picked: ({ step }, { model }) => ({
    model: { playing: false, branch: step === null ? null : model.branch },
    command: travel({ to: step }),
  }),
  Branched: ({ id }) => ({
    model: { playing: false, branch: id },
    command: travel({ to: id }),
  }),
  Forked: (_, data) => {
    const shown = shownOf(data);
    return shown === null
      ? { model: { playing: false } }
      : {
          model: { playing: false, branch: null },
          command: fork({ from: shown }),
        };
  },
  Played: ({ playing }, data) => {
    const first = firstOf(data);
    return playing && shownOf(data) === null && first !== undefined
      ? { model: { playing }, command: travel({ to: first }) }
      : { model: { playing } };
  },
  Ticked: (_, data) => {
    const next = nextOf(data);
    return next === null
      ? { model: { playing: false }, command: travel({ to: null }) }
      : { command: travel({ to: next }) };
  },
  Opened: ({ id, open }, data) => {
    const { model } = data;
    const shown = shownOf(data);
    const rest = model.opened.filter((one) => one !== id);
    return {
      model: {
        opened: open ? [...rest, id] : rest,
        closed:
          !open && id === followedOf(data) && typeof shown === 'number'
            ? shown
            : model.closed,
      },
    };
  },
};
