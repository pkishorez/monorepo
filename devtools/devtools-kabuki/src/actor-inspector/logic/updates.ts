import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { fork, preview } from './commands.ts';
import { awayFromHead, nextOf, onBranch } from './shared/index.ts';
import type { InspectorShape, Step } from './shared/index.ts';

export const init: InitOf<typeof InspectorShape> = (input) => ({
  model: {
    ...input,
    now: null,
    epoch: '',
    entries: [],
    branch: null,
    shown: null,
    stepped: null,
    previewing: false,
    removed: false,
    compared: false,
    opened: null,
    playing: false,
    problem: null,
  },
});

const shownIn = (previewing: boolean, shown: Step | null) =>
  previewing ? { command: preview({ at: shown }) } : {};

export const updates: UpdatesOf<typeof InspectorShape> = {
  Heard: ({ now, epoch, entries }, data) => {
    const { model } = data;
    const { shown } = model;
    const kept =
      epoch === model.epoch || model.epoch === ''
        ? typeof shown !== 'number' || entries.some(({ id }) => id === shown)
        : shown === null;
    const off =
      kept &&
      typeof shown === 'number' &&
      !onBranch({ ...data, model: { ...model, now, entries } }, shown);
    return {
      model: {
        now,
        epoch,
        entries,
        shown: kept ? shown : null,
        branch: off ? shown : kept ? model.branch : null,
        problem: null,
      },
    };
  },
  Read: ({ stepped }) => ({ model: { stepped, problem: null } }),
  Failed: ({ problem }) => ({ model: { problem } }),
  Picked: ({ step }, data) => ({
    model: {
      shown: step,
      playing: false,
      branch:
        step === null
          ? null
          : typeof step === 'number' && !onBranch(data, step)
            ? step
            : data.model.branch,
    },
    ...shownIn(data.model.previewing, step),
  }),
  Branched: ({ id }, { model }) => ({
    model: { shown: id, branch: id, playing: false },
    ...shownIn(model.previewing, id),
  }),
  Previewed: ({ on }, { model }) => ({
    model: { previewing: on },
    command: preview({ at: on ? model.shown : null }),
  }),
  Forked: (_, { model }) =>
    model.shown === null
      ? {}
      : {
          model: {
            shown: null,
            branch: null,
            previewing: false,
            playing: false,
          },
          command: fork({ from: model.shown }),
        },
  Toggled: ({ removed }) => ({ model: { removed } }),
  Compared: ({ on }) => ({ model: { compared: on } }),
  Opened: ({ address }) => ({ model: { opened: address } }),
  Played: ({ playing }, { model }) =>
    playing && model.shown === null && model.entries.length > 0
      ? {
          model: { playing, shown: 'start' },
          ...shownIn(model.previewing, 'start'),
        }
      : { model: { playing } },
  Ticked: (_, data) => {
    const next = nextOf(data);
    return next === null && awayFromHead(data)
      ? { model: { playing: false } }
      : next === null
        ? {
            model: { playing: false, shown: null, branch: null },
            ...shownIn(data.model.previewing, null),
          }
        : { model: { shown: next }, ...shownIn(data.model.previewing, next) };
  },
};
