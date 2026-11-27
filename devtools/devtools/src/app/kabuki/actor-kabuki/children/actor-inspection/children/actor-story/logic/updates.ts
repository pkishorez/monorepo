import type { DataOf, InitOf, UpdatesOf } from '@kestack/kabuki/types';
import type { Plan, Shape } from '@kestack/devtools-kabuki/devtools';
import type { JsonSchema } from '../../../../../../../services/agent/contract/index.js';
import { ask, cancel, clear, followUp } from './commands.js';
import { IDLE, KEPT, busyOf } from '../../../logic/shared/index.js';
import type { Asking } from '../../../logic/shared/index.js';
import {
  beatsOf,
  dataOf,
  focusOf,
  foldsOf,
  itemsOf,
  namesOf,
  opensOf,
  payloadOf,
  plansOf,
  promptOf,
  refOf,
  refsOf,
  resolve,
  rowsOf,
  shownOf,
  statesOf,
} from './shared/index.js';
import type { At, Explored, StoryShape, Turn } from './shared/index.js';

type Data = DataOf<typeof StoryShape>;

export const SYSTEM = `You explain a Kabuki app to a developer as a story told on its Blueprint, one picture at a time. Whatever the question, answer only with Beats.

Read the code in this folder first, so every purpose and meaning you give is right, and so you know which State each actor starts in and which Messages move it between States. Point only at actors and refs from the given Blueprint.

Every card has the same shape, by Kabuki's levels: its description; its model keys; Always, what holds at the top level (the Workers that always run, the Messages it takes in any State, the Children it always places, its Emits, Requires, Provides, Queries, Input and Props); then one row per State, holding that State's data keys, Workers, Messages and Children.

Every card starts folded but for its model's top-level keys: each section, such as Messages or Input, shows only its count, each State only its name, and a nested key only its parent. What you light unfolds what holds it: its State, its whole section with the lit rows marked and the rest dimmed, and the keys above it. So the reader sees exactly what a Beat is about, among its neighbours, and nothing else.

A Beat is the whole picture on screen, not a change from the Beat before: \`focus\` is the actor the camera centres on, and \`show\` lists each lit card with \`lit\`, exactly the refs to light on it. Cards not in \`show\` are drawn quiet, name only. Light a few things per Beat, usually 1 to 4 refs, never a whole section's worth: to explain a Message, light \`message:<Tag>\` and the model keys or State it changes.

Refs: \`description\`; \`model\` or \`model.<key>\`; \`input\`, \`input.<key>\`, \`props\`, \`props.<key>\`; \`state:<Tag>\` for a State itself and \`state:<Tag>.<key>\` for its data; \`worker:<name>\`, \`message:<Tag>\`, \`message:<Tag>.<key>\` and \`child:<slot>\`, which find their own level (written \`state:<Tag>/worker:<name>\` when a name is at several levels); \`emits:<Tag>\`, \`requires\`, \`provides\`, \`queries\`.

Tell the story in levels, one step per Beat, skipping what the question does not need:
1. The actor that matters for the question, and what it is for (\`description\`).
2. Its model keys and what they mean.
3. "It can be in these States": light the State it starts in (its init), then each State the story moves through, in order.
4. Inside a State: its data, the Worker that runs there, the Message that leaves it.
5. The moves between States, such as "Loaded moves it to Ready": light the Message and the State it moves to.
6. Then its Children and how they talk: show their cards too, with \`links\` from parent to child for Props going down, from child to parent for an Emit going up, and from sender to receiver for a Message sent.

\`say\` is 1 to 3 sentences of markdown about what is lit now, such as "It starts in Loading, where the \`load\` Worker fetches the list.". Use 4 to 12 Beats. Answer a follow-up the same way: a new story, starting from the actor it is about.`;

const braced = (name: string, shape: Shape | undefined) => {
  const names = shape === undefined ? [] : namesOf(shape);
  return names.length === 0 ? name : `${name} { ${names.join(', ')} }`;
};

const listed = (label: string, names: ReadonlyArray<string>) =>
  names.length === 0 ? [] : [`${label}: ${names.join(', ')}`];

const keysLine = (label: string, shape: Shape | undefined) =>
  listed(label, shape === undefined ? [] : rowsOf(shape).map(({ id }) => id));

const levelLines = (plan: Plan, level: string | null) => [
  ...listed(
    'workers',
    itemsOf(plan, 'worker')
      .filter((item) => item.level === level)
      .map((item) => refOf(plan, item)),
  ),
  ...listed(
    'messages',
    itemsOf(plan, 'message')
      .filter((item) => item.level === level)
      .map((item) => braced(refOf(plan, item), payloadOf(plan, item))),
  ),
  ...listed(
    'children',
    itemsOf(plan, 'child')
      .filter((item) => item.level === level)
      .map((item) => refOf(plan, item)),
  ),
  ...listed(
    'provides',
    plan.provides
      .filter(({ state }) => (state ?? null) === level)
      .map(({ name }) => name),
  ),
  ...listed(
    'queries',
    plan.queries
      .filter(({ state }) => (state ?? null) === level)
      .map(({ name }) => name),
  ),
];

const stateLine = (plan: Plan, tag: string) => {
  const data = dataOf(plan, tag);
  const ids = data === undefined ? [] : rowsOf(data).map(({ id }) => id);
  return ids.length === 0
    ? `state:${tag}`
    : `state:${tag} { ${ids.join(', ')} }`;
};

const nested = (heading: string, lines: ReadonlyArray<string>) =>
  lines.length === 0 ? [] : [heading, ...lines.map((line) => `  ${line}`)];

const lines = (plan: Plan, depth: number): ReadonlyArray<string> => {
  const indent = '  '.repeat(depth);
  return [
    `${indent}${plan.path}${plan.description === undefined ? '' : ` — ${plan.description}`}${plan.repeats === undefined ? '' : ` (repeats ${plan.repeats})`}`,
    ...[
      ...keysLine('model', plan.model),
      ...nested('always:', [
        ...levelLines(plan, null),
        ...listed(
          'emits',
          plan.emits.map(({ tag, payload }) => braced(`emits:${tag}`, payload)),
        ),
        ...listed('requires', plan.requires),
        ...keysLine('input', plan.input),
        ...keysLine('props', plan.props),
      ]),
      ...statesOf(plan).flatMap((tag) => [
        stateLine(plan, tag),
        ...levelLines(plan, tag).map((line) => `  ${line}`),
      ]),
    ].map((line) => `${indent}  ${line}`),
    ...plan.children.flatMap(({ plan: child }) => lines(child, depth + 1)),
  ];
};

export const treeOf = (root: Plan) => lines(root, 0).join('\n');

const hashOf = (text: string) => {
  let hash = 5381;
  for (let at = 0; at < text.length; at++)
    hash = ((hash << 5) + hash + text.charCodeAt(at)) | 0;
  return (hash >>> 0).toString(36);
};

const unique = (all: ReadonlyArray<string>) => [...new Set(all)];

const choice = (values: ReadonlyArray<string>, description: string) => ({
  type: 'string',
  ...(values.length === 0 ? {} : { enum: values }),
  description,
});

export const schemaOf = (root: Plan): JsonSchema => {
  const plans = plansOf(root);
  const paths = plans.map(({ path }) => path);
  const refs = unique(plans.flatMap(refsOf));
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'beats'],
    properties: {
      title: {
        type: 'string',
        description: 'A few words naming what this answer explains',
      },
      beats: {
        type: 'array',
        description:
          'The story, in the order to tell it; each Beat is the whole picture on screen',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['say', 'focus', 'show'],
          properties: {
            say: {
              type: 'string',
              description: '1 to 3 sentences of markdown about what is lit now',
            },
            focus: choice(paths, 'The actor the camera centres on'),
            show: {
              type: 'array',
              description:
                'Every lit card and exactly the refs lit on it; the rest of the card is dimmed, and the cards not listed are quiet, name only',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['actor', 'lit'],
                properties: {
                  actor: choice(paths, 'The path of the actor on this card'),
                  lit: {
                    type: 'array',
                    description:
                      'The refs to light on this card, one of its own each, usually 1 to 4',
                    items: choice(refs, 'A ref of this actor'),
                  },
                },
              },
            },
            links: {
              type: 'array',
              description:
                'Edges to light: parent to child for Props, child to parent for an Emit, sender to receiver for a Message',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['from', 'to'],
                properties: {
                  from: choice(paths, 'Where it starts'),
                  to: choice(paths, 'Where it ends'),
                  label: {
                    type: 'string',
                    description:
                      'A word or two on the edge, such as the Emit or Prop it carries',
                  },
                },
              },
            },
          },
        },
      },
    },
  };
};

type Model = Data['model'];

const fresh = {
  turns: [],
  run: IDLE,
  sent: null,
  pending: null,
  problem: null,
  at: null,
  playing: false,
  explore: null,
} as const;

const away = { ...fresh, threads: [], thread: null, chips: [] } as const;

const asked = (
  model: Model,
  folder: string,
  asking: Asking,
  again: boolean,
) => {
  if (model.plan === null) return {};
  const tree = treeOf(model.plan);
  const hash = hashOf(tree);
  const schema = schemaOf(model.plan);
  const next = {
    model: { ...model, sent: hash, pending: asking, problem: null, chips: [] },
  };
  if (model.thread === null)
    return {
      ...next,
      command: ask({
        folder,
        prompt: promptOf(asking, tree),
        system: SYSTEM,
        schema,
      }),
    };
  return {
    ...next,
    command: followUp({
      thread: model.thread,
      prompt: promptOf(asking, again || model.sent !== hash ? tree : null),
      schema,
    }),
  };
};

const answeredAnew = (
  before: ReadonlyArray<Turn>,
  after: ReadonlyArray<Turn>,
) =>
  after.length > 0 &&
  after.at(-1)!.answer !== null &&
  (before.length !== after.length || before.at(-1)?.answer === null);

const lastAnswered = (turns: ReadonlyArray<Turn>): At | null => {
  const turn = turns.findLastIndex(
    ({ answer }) => answer !== null && answer.beats.length > 0,
  );
  return turn === -1 ? null : { turn, beat: 0 };
};

const moved = (model: Model, by: number) => {
  if (model.at === null) return model.at;
  const count = beatsOf(model.turns, model.at.turn).length;
  const beat = Math.min(count - 1, Math.max(0, model.at.beat + by));
  return { ...model.at, beat };
};

const exploredOf = (data: Data): ReadonlyArray<Explored> => {
  if (data.model.explore !== null) return data.model.explore;
  const focus = focusOf(data);
  return focus === null ? [] : [...focus.picture.cards.values()].map(shownOf);
};

const planOf = ({ model }: Data, actor: string) =>
  model.plan === null
    ? null
    : (plansOf(model.plan).find(({ path }) => path === actor) ?? null);

const edited = (
  all: ReadonlyArray<Explored>,
  actor: string,
  edit: (shown: Explored) => Explored,
) => {
  const known = all.some((shown) => shown.actor === actor);
  return known
    ? all.map((shown) => (shown.actor === actor ? edit(shown) : shown))
    : [...all, edit({ actor, lit: [] })];
};

const toggledIn = (data: Data, actor: string, ref: string) => {
  const plan = planOf(data, actor);
  if (plan === null) return null;
  const ids = resolve(plan, ref);
  if (ids.length === 0) return null;
  return edited(exploredOf(data), actor, (shown) => {
    const on = ids.every((id) => shown.lit.includes(id));
    const lit = on
      ? shown.lit.filter((id) => !ids.includes(id))
      : [...new Set([...shown.lit, ...ids])];
    return {
      ...shown,
      lit,
      ...(shown.open === undefined || on
        ? {}
        : { open: [...new Set([...shown.open, ...opensOf(plan, ids)])] }),
    };
  });
};

const foldedIn = (data: Data, actor: string, fold: string) => {
  const plan = planOf(data, actor);
  if (plan === null || !foldsOf(plan).has(fold)) return null;
  return edited(exploredOf(data), actor, (shown) => {
    const open = shown.open ?? [...opensOf(plan, shown.lit)];
    return {
      ...shown,
      open: open.includes(fold)
        ? open.filter((one) => one !== fold)
        : [...open, fold],
    };
  });
};

export const init: InitOf<typeof StoryShape> = ({ app }) => ({
  state: { _tag: 'Recall' },
  model: {
    app,
    projects: null,
    listProblem: null,
    worktrees: null,
    worktreesProblem: null,
    plan: null,
    planProblem: null,
    live: [],
    threads: [],
    thread: null,
    chips: [],
    clearing: KEPT,
    ...fresh,
  },
});

export const updates: UpdatesOf<typeof StoryShape> = {
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
  Planned: ({ plan }) => ({ model: { plan, planProblem: null } }),
  PlanRefused: ({ problem }) => ({ model: { planProblem: problem } }),
  Replanned: () => ({ model: { plan: null, planProblem: null } }),
  Lived: ({ paths }, { model }) =>
    paths.length === model.live.length &&
    paths.every((path, at) => path === model.live[at])
      ? {}
      : { model: { live: paths } },
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
  Chipped: ({ chip }, { model }) =>
    model.chips.includes(chip)
      ? {}
      : { model: { chips: [...model.chips, chip] } },
  Unchipped: ({ chip }, { model }) => ({
    model: { chips: model.chips.filter((one) => one !== chip) },
  }),
  Stepped: ({ by }, { model }) => ({
    model: { at: moved(model, by), explore: null },
  }),
  Jumped: ({ turn, beat }, { model }) =>
    beatsOf(model.turns, turn)[beat] === undefined
      ? {}
      : { model: { at: { turn, beat }, playing: false, explore: null } },
  Played: ({ playing }, { model }) => {
    if (!playing || model.at === null) return { model: { playing: false } };
    const last = beatsOf(model.turns, model.at.turn).length - 1;
    return {
      model: {
        playing: true,
        explore: null,
        at: model.at.beat >= last ? { ...model.at, beat: 0 } : model.at,
      },
    };
  },
  Advanced: (_, { model }) => {
    if (!model.playing || model.at === null) return {};
    const last = beatsOf(model.turns, model.at.turn).length - 1;
    return model.at.beat >= last
      ? { model: { playing: false } }
      : { model: { at: moved(model, 1) } };
  },
  Explored: (_, data) =>
    data.model.explore !== null
      ? {}
      : { model: { explore: exploredOf(data), playing: false } },
  Toggled: ({ actor, ref }, data) => {
    const explore = toggledIn(data, actor, ref);
    return explore === null ? {} : { model: { explore, playing: false } };
  },
  Folded: ({ actor, fold }, data) => {
    const explore = foldedIn(data, actor, fold);
    return explore === null ? {} : { model: { explore, playing: false } };
  },
  Returned: () => ({ model: { explore: null } }),
  Started: ({ thread }) => ({ model: { thread } }),
  Refused: ({ problem }) => ({ model: { problem, sent: null } }),
  Watched: ({ turns, run }, { model }) => {
    const pending =
      model.pending !== null && turns.length > model.turns.length
        ? null
        : model.pending;
    const at = lastAnswered(turns);
    const focus =
      answeredAnew(model.turns, turns) || (model.at === null && at !== null)
        ? { at, playing: false, explore: null }
        : {};
    return { model: { turns, run, pending, ...focus } };
  },
  Lost: (_, { model }) => ({
    model: { ...model, ...fresh, thread: null },
  }),
  Threaded: ({ threads }) => ({ model: { threads } }),
  Opened: ({ thread }, { model }) =>
    thread === model.thread ? {} : { model: { ...model, ...fresh, thread } },
  Asked: ({ question }, data) => {
    const { model, state } = data;
    if (
      state._tag !== 'Open' ||
      busyOf(model.pending, model.problem, model.run) ||
      (question.trim() === '' && model.chips.length === 0)
    )
      return {};
    return asked(
      model,
      state.folder,
      { question: question.trim(), chips: model.chips },
      false,
    );
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
    return asked(
      { ...model, pending: null },
      state.folder,
      { question: last.question, chips: last.chips },
      true,
    );
  },
  Stopped: (_, { model }) =>
    model.thread === null || model.run.status !== 'running'
      ? {}
      : { command: cancel({ thread: model.thread }) },
  ClearAsked: (_, { state, model }) =>
    state._tag === 'Open' && model.clearing._tag === 'Kept'
      ? { model: { clearing: { _tag: 'Confirming', problem: null } } }
      : {},
  ClearDismissed: (_, { model }) =>
    model.clearing._tag === 'Confirming' ? { model: { clearing: KEPT } } : {},
  ClearConfirmed: (_, { state, model }) =>
    state._tag === 'Open' && model.clearing._tag === 'Confirming'
      ? {
          model: { clearing: { _tag: 'Clearing' } },
          command: clear({ folder: state.folder }),
        }
      : {},
  Cleared: (_, { model }) => ({
    model: { ...model, ...fresh, threads: [], thread: null, clearing: KEPT },
  }),
  ClearRefused: ({ problem }) => ({
    model: { clearing: { _tag: 'Confirming', problem } },
  }),
};
