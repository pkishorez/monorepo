import type { DataOf, InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { IDLE, busyOf } from '../../../../../logic/shared/index.js';
import { ask, cancel, followUp } from './commands.js';
import type { ChatShape } from './shared/index.js';

type Model = DataOf<typeof ChatShape>['model'];

const fresh = { turns: [], run: IDLE, pending: null, problem: null } as const;

const away = { ...fresh, threads: [], thread: null } as const;

const asked = (model: Model, folder: string, question: string) => ({
  model: {
    ...model,
    pending: { question, chips: [] },
    problem: null,
  },
  command:
    model.thread === null
      ? ask({ name: model.name, app: model.app, folder, prompt: question })
      : followUp({ thread: model.thread, prompt: question }),
});

export const init: InitOf<typeof ChatShape> = ({ name, app }) => ({
  state: { _tag: 'Recall' },
  model: {
    name,
    app,
    projects: null,
    listProblem: null,
    worktrees: null,
    worktreesProblem: null,
    threads: [],
    thread: null,
    ...fresh,
  },
});

export const updates: UpdatesOf<typeof ChatShape> = {
  Recalled: ({ remembered }, { model }) =>
    remembered === null
      ? { state: { _tag: 'Choice' } }
      : {
          state: {
            _tag: 'Open',
            project: remembered.project,
            folder: remembered.folder,
          },
          model: { ...model, thread: remembered.thread },
        },
  Listed: ({ projects }) => ({ model: { projects, listProblem: null } }),
  ListRefused: ({ problem }) => ({ model: { listProblem: problem } }),
  Relisted: () => ({ model: { projects: null, listProblem: null } }),
  WorktreesListed: ({ worktrees }) => ({
    model: { worktrees, worktreesProblem: null },
  }),
  WorktreesRefused: ({ problem }) => ({
    model: { worktreesProblem: problem },
  }),
  WorktreesRelisted: () => ({
    model: { worktrees: null, worktreesProblem: null },
  }),
  Chose: ({ project }, { state, model }) =>
    state._tag === 'Open' && state.project === project
      ? {}
      : {
          state: { _tag: 'Open', project, folder: project },
          model: {
            ...model,
            ...away,
            worktrees: null,
            worktreesProblem: null,
          },
        },
  Switched: ({ folder }, { state, model }) =>
    state._tag !== 'Open' ||
    state.folder === folder ||
    !(model.worktrees ?? []).some((worktree) => worktree.folder === folder)
      ? {}
      : {
          state: { _tag: 'Open', project: state.project, folder },
          model: { ...model, ...away },
        },
  Threaded: ({ threads }) => ({ model: { threads } }),
  Opened: ({ thread }, { model }) =>
    thread === model.thread ? {} : { model: { ...model, ...fresh, thread } },
  Asked: ({ question }, data) => {
    const { model, state } = data;
    const text = question.trim();
    if (
      state._tag !== 'Open' ||
      busyOf(model.pending, model.problem, model.run) ||
      text === ''
    )
      return {};
    return asked(model, state.folder, text);
  },
  Retried: (_, data) => {
    const { model, state } = data;
    const last = model.pending ?? model.turns.at(-1);
    if (
      state._tag !== 'Open' ||
      last === undefined ||
      busyOf(model.pending, model.problem, model.run)
    )
      return {};
    return asked({ ...model, pending: null }, state.folder, last.question);
  },
  Started: ({ thread }) => ({ model: { thread } }),
  Refused: ({ problem }) => ({ model: { problem } }),
  Watched: ({ turns, run }, { model }) => ({
    model: {
      turns,
      run,
      pending:
        model.pending !== null && turns.length > model.turns.length
          ? null
          : model.pending,
    },
  }),
  Lost: (_, { model }) => ({ model: { ...model, ...fresh, thread: null } }),
  Stopped: (_, { model }) =>
    model.thread === null || model.run.status !== 'running'
      ? {}
      : { command: cancel({ thread: model.thread }) },
};
