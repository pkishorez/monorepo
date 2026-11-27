import { useState } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import type { Plan } from '@kestack/devtools-kabuki/devtools';
import type { StoryShape } from '../logic/shared/index.js';
import { Body } from './view.js';

type Props = ViewPropsOf<typeof StoryShape>;
type Model = Props['model'];

const empty = { kind: 'struct', fields: [] } as const;

const text = (
  name: string,
  kind: 'text' | 'number' | 'boolean' = 'text',
  description?: string,
) => ({
  name,
  optional: false,
  nullable: false,
  ...(description === undefined ? {} : { description }),
  shape: { kind },
});

const todo: Plan = {
  path: 'Playground/Home:todos/Ready:todo',
  actor: 'Todo',
  description: 'One to-do: its title, whether it is done, and renaming it',
  input: { kind: 'struct', fields: [text('id'), text('title')] },
  model: {
    kind: 'struct',
    fields: [text('title', 'text', 'What the to-do says, as last saved')],
  },
  props: {
    kind: 'struct',
    fields: [text('done', 'boolean', 'Whether Todos has it ticked')],
  },
  states: [
    { tag: 'Idle', data: empty },
    {
      tag: 'Editing',
      data: {
        kind: 'struct',
        fields: [text('draft', 'text', 'The title being typed')],
      },
    },
    { tag: 'Saving', data: { kind: 'struct', fields: [text('draft')] } },
  ],
  messages: [
    { tag: 'Ticked', description: 'Tick it done or not done', payload: empty },
    {
      tag: 'Renamed',
      state: 'Editing',
      payload: { kind: 'struct', fields: [text('title')] },
    },
    { tag: 'Saved', state: 'Saving', payload: empty },
  ],
  workers: [],
  emits: [
    { tag: 'Toggled', payload: { kind: 'struct', fields: [text('id')] } },
    { tag: 'Deleted', payload: { kind: 'struct', fields: [text('id')] } },
  ],
  requires: ['Store'],
  provides: [],
  queries: [],
  children: [],
};

const todos: Plan = {
  path: 'Playground/Home:todos',
  actor: 'Todos',
  description: 'The list, loaded from the server, with one Todo per to-do',
  model: {
    kind: 'struct',
    fields: [
      {
        name: 'done',
        optional: false,
        nullable: false,
        description: 'The ids of the to-dos ticked done',
        shape: { kind: 'array', of: { kind: 'text' } },
      },
      {
        name: 'filter',
        optional: false,
        nullable: false,
        shape: { kind: 'choice', options: ['all', 'open', 'done'] },
      },
      {
        name: 'saving',
        optional: true,
        nullable: false,
        description: 'The tick being saved, while the server is asked',
        shape: {
          kind: 'struct',
          fields: [text('id'), text('tries', 'number')],
        },
      },
    ],
  },
  states: [
    { tag: 'Loading', data: empty },
    {
      tag: 'Ready',
      data: {
        kind: 'struct',
        fields: [
          text('loadedAt', 'number', 'When the list came from the server'),
        ],
      },
    },
    {
      tag: 'Failed',
      data: {
        kind: 'struct',
        fields: [text('reason', 'text', 'What the server said went wrong')],
      },
    },
  ],
  messages: [
    {
      tag: 'Filtered',
      description: 'Show all, open or done to-dos',
      payload: { kind: 'struct', fields: [text('filter')] },
    },
    {
      tag: 'Loaded',
      state: 'Loading',
      payload: {
        kind: 'struct',
        fields: [
          {
            name: 'items',
            optional: false,
            nullable: false,
            description: 'The to-dos the server sent',
            shape: {
              kind: 'array',
              of: { kind: 'struct', fields: [text('id'), text('title')] },
            },
          },
        ],
      },
    },
    {
      tag: 'LoadFailed',
      state: 'Loading',
      payload: {
        kind: 'struct',
        fields: [text('reason', 'text', 'Why the list could not load')],
      },
    },
    {
      tag: 'Retried',
      state: 'Failed',
      description: 'Load the list again',
      payload: empty,
    },
    {
      tag: 'Toggled',
      state: 'Ready',
      payload: {
        kind: 'struct',
        fields: [text('id', 'text', 'The to-do ticked')],
      },
    },
    {
      tag: 'Added',
      state: 'Ready',
      description: 'Add a to-do',
      payload: { kind: 'struct', fields: [text('title')] },
    },
  ],
  workers: [
    { name: 'load', runs: 'while', state: 'Loading' },
    { name: 'sync', runs: 'each', state: 'Ready' },
  ],
  emits: [],
  requires: ['Server'],
  provides: [{ name: 'Store', state: 'Ready' }],
  queries: [{ name: 'left', state: 'Ready', result: { kind: 'number' } }],
  children: [
    { name: 'todo', state: 'Ready', runs: 'each', keyed: true, plan: todo },
  ],
};

const routed = (
  tag: string,
  description: string,
  keys: ReadonlyArray<readonly [string, string?]> = [],
) => ({
  tag,
  description,
  payload: {
    kind: 'struct' as const,
    fields: keys.map(([name, about]) => text(name, 'text', about)),
  },
});

const plan: Plan = {
  path: 'Playground',
  actor: 'Router',
  description: 'The Router: which page the URL is on, and moving between pages',
  model: {
    kind: 'struct',
    fields: [
      text('location', 'text', 'The URL the page shows, path and hash'),
      text(
        'hashScrollIntoView',
        'boolean',
        'Whether a #hash scrolls its element into view on arrival',
      ),
      text('scrollRestoration', 'text'),
      {
        name: 'history',
        optional: false,
        nullable: false,
        description: 'The entries Back and Forward move through',
        shape: {
          kind: 'array',
          of: {
            kind: 'struct',
            fields: [
              text('path', 'text', 'Where the entry points'),
              text('scrollTop', 'number'),
            ],
          },
        },
      },
    ],
  },
  states: [
    { tag: 'Home', data: empty },
    { tag: 'Missing', data: empty },
  ],
  messages: [
    routed('Navigated', 'Go to a path, adding a History entry', [
      ['path', 'The path to go to'],
      ['replace', 'Replace the current entry instead'],
    ]),
    routed('WentBack', 'Go one History entry back'),
    routed('WentForward', 'Go one History entry forward'),
    routed('Popped', '', [['location']]),
    routed('Hashed', 'Scroll to the element a #hash names', [['hash']]),
    routed('Reloaded', 'Load the current page again'),
    routed('Searched', 'Change the query string, keeping the path', [
      ['search', 'The new query string'],
    ]),
    routed('Linked', 'Follow a link inside the app', [['href'], ['target']]),
    routed('Blocked', 'Hold navigation while a form has unsaved work', [
      ['reason', 'Said to the person before they leave'],
    ]),
    routed('Unblocked', 'Let navigation go on again'),
    routed('Scrolled', '', [['scrollTop']]),
    routed('Restored', 'Put the scroll back where it was on this entry'),
    routed('Preloaded', 'Load a page ahead of a click', [['path']]),
    routed('Failed', 'A page could not load', [['path'], ['reason']]),
    routed('Retried', 'Load the page that failed again'),
    routed('Titled', 'Set the document title', [['title']]),
  ],
  workers: [],
  emits: [],
  requires: [],
  provides: [],
  queries: [],
  children: [
    { name: 'todos', state: 'Home', runs: 'always', keyed: false, plan: todos },
  ],
};

const TODOS = 'Playground/Home:todos';
const TODO = 'Playground/Home:todos/Ready:todo';

const turns: Model['turns'] = [
  {
    question: 'How does the app start?',
    chips: [],
    text: null,
    answer: {
      title: 'Starting up',
      beats: [
        {
          say: 'Here is the **Router**: `location` is the URL it is on, and `Navigated` is how it moves.',
          focus: 'Playground',
          show: [
            {
              actor: 'Playground',
              lit: ['description', 'model.location', 'message:Navigated'],
            },
          ],
        },
        {
          say: 'In **Home** it places **Todos**.',
          focus: TODOS,
          show: [
            { actor: 'Playground', lit: ['state:Home', 'child:todos'] },
            { actor: TODOS, lit: ['description'] },
          ],
          links: [{ from: 'Playground', to: TODOS, label: 'places' }],
        },
      ],
    },
  },
  {
    question: 'How does the list load?',
    chips: [`${TODOS} · worker:load`],
    text: null,
    answer: {
      title: 'Loading the list',
      beats: [
        {
          say: 'Here is **Todos**: the list of to-dos, loaded from the server.',
          focus: TODOS,
          show: [{ actor: TODOS, lit: ['description'] }],
        },
        {
          say: 'It keeps `done`, the ids ticked, and `filter`, which ones to show.',
          focus: TODOS,
          show: [{ actor: TODOS, lit: ['model.done', 'model.filter'] }],
        },
        {
          say: 'It starts in **Loading**, where the `load` Worker asks the server for the list.',
          focus: TODOS,
          show: [{ actor: TODOS, lit: ['state:Loading', 'worker:load'] }],
        },
        {
          say: 'When the server answers, `Loaded` moves it to **Ready**, with the `items` it sent.',
          focus: TODOS,
          show: [
            {
              actor: TODOS,
              lit: ['message:Loaded.items', 'state:Ready'],
            },
          ],
        },
        {
          say: 'If the server fails, `LoadFailed` moves it to **Failed**, and `Retried` takes it back to Loading.',
          focus: TODOS,
          show: [
            {
              actor: TODOS,
              lit: ['message:LoadFailed', 'state:Failed', 'message:Retried'],
            },
          ],
        },
        {
          say: 'In Ready it places one **Todo** per to-do: `done` goes down as a Prop, and `Toggled` comes back up.',
          focus: TODO,
          show: [
            { actor: TODOS, lit: ['child:todo', 'message:Toggled'] },
            { actor: TODO, lit: ['props.done', 'emits:Toggled'] },
          ],
          links: [
            { from: TODOS, to: TODO, label: 'done' },
            { from: TODO, to: TODOS, label: 'Toggled' },
          ],
        },
        {
          say: 'The **History** keeps every tick so it can be replayed.',
          focus: 'Playground/Home:history',
          show: [{ actor: 'Playground/Home:history', lit: ['model'] }],
        },
      ],
    },
  },
];

const model: Model = {
  app: '@kestack/kabuki-playground',
  projects: [{ name: 'kestack', path: '~/code/kestack' }],
  listProblem: null,
  worktrees: [
    {
      folder: '~/code/kestack-worktrees/story',
      branch: 'story-round-2',
      head: '19f4f65ca',
      primary: false,
      current: false,
    },
    {
      folder: '~/code/kestack',
      branch: 'main',
      head: '16fea7925',
      primary: true,
      current: true,
    },
    {
      folder: '~/code/kestack-worktrees/bisect',
      branch: null,
      head: 'd044e50c2',
      primary: false,
      current: false,
    },
  ],
  worktreesProblem: null,
  plan,
  planProblem: null,
  live: ['Playground', 'Playground/Home:todos', 'Playground/Home:todos/todo'],
  threads: [{ id: 't1', title: 'Starting up', createdAt: 1 }],
  thread: 't1',
  turns,
  run: { status: 'done', reason: null, since: 0, activity: [] },
  sent: null,
  pending: null,
  problem: null,
  chips: ['Playground/Home:todos · state:Ready'],
  at: { turn: 1, beat: 1 },
  playing: false,
  explore: null,
};

const open = (patch: Partial<Model>): Props => ({
  _tag: 'Open',
  model: { ...model, ...patch },
  state: {
    _tag: 'Open',
    project: '~/code/kestack',
    folder: '~/code/kestack-worktrees/story',
  },
  props: { shown: true },
  send: () => {},
  root: { ref: undefined, style: undefined },
});

const frame = (props: Props) => (
  <div className="flex h-[720px] flex-col border-b border-border">
    <Body {...props} />
  </div>
);

function Stepping() {
  const [at, setAt] = useState({ turn: 1, beat: 0 });
  const count = (turn: number) => turns[turn]?.answer?.beats.length ?? 0;
  return frame({
    ...open({ at }),
    send: (message) => {
      if (message._tag === 'Stepped')
        setAt((was) => ({
          ...was,
          beat: Math.min(
            count(was.turn) - 1,
            Math.max(0, was.beat + message.by),
          ),
        }));
      if (message._tag === 'Jumped')
        setAt({ turn: message.turn, beat: message.beat });
    },
  });
}

export default {
  'story mode, stepping': <Stepping />,
  'story mode, model keys': frame(open({ playing: true })),
  'story mode, the starting State and its Worker': frame(
    open({ at: { turn: 1, beat: 2 } }),
  ),
  'story mode, a transition Message': frame(open({ at: { turn: 1, beat: 3 } })),
  'story mode, into Failed and back': frame(open({ at: { turn: 1, beat: 4 } })),
  'story mode, Props down and an Emit up': frame(
    open({ at: { turn: 1, beat: 5 } }),
  ),
  'story mode, a long card': frame(open({ at: { turn: 0, beat: 0 } })),
  'explore mode': frame(
    open({
      at: { turn: 1, beat: 2 },
      explore: [
        {
          actor: TODOS,
          lit: ['state:Loading/worker:load', 'state:Ready.loadedAt'],
          open: ['Loading', 'Ready'],
        },
        { actor: TODO, lit: ['props.done'] },
      ],
    }),
  ),
  'not found': frame(open({ at: { turn: 1, beat: 6 } })),
  thinking: frame(
    open({
      turns: [
        ...turns,
        { question: 'Where is it saved?', chips: [], answer: null, text: null },
      ],
      at: { turn: 1, beat: 1 },
      run: {
        status: 'running',
        reason: null,
        since: Date.now() - 14_000,
        activity: [
          'Reading src/app/todos/actor.tsx',
          'Searching for "sync"',
          'Reading src/services/server/real/index.ts',
        ],
      },
    }),
  ),
  failed: frame(
    open({
      run: {
        status: 'failed',
        reason: 'Claude Code is not signed in. Run `claude` once to sign in.',
        since: 0,
        activity: [],
      },
    }),
  ),
  'no project': frame({
    _tag: 'Choice',
    model: { ...model, plan: null, turns: [], at: null },
    state: { _tag: 'Choice' },
    props: { shown: true },
    send: () => {},
    root: { ref: undefined, style: undefined },
  }),
};
