import type { Plan } from '@kestack/devtools-kabuki/devtools';

const empty = { kind: 'struct', fields: [] } as const;

const field = (name: string, kind: 'text' | 'number' | 'boolean') => ({
  name,
  optional: false,
  nullable: false,
  shape: { kind },
});

const item: Plan = {
  path: 'App/Ready:list/items',
  actor: 'Item',
  description: 'One to-do',
  input: { kind: 'struct', fields: [field('id', 'text')] },
  model: {
    kind: 'struct',
    fields: [
      { ...field('title', 'text'), description: 'What the to-do says' },
      {
        name: 'tags',
        optional: true,
        nullable: true,
        shape: {
          kind: 'array',
          of: {
            kind: 'struct',
            fields: [
              field('label', 'text'),
              {
                name: 'tone',
                optional: false,
                nullable: false,
                shape: { kind: 'choice', options: ['calm', 'loud'] },
              },
            ],
          },
        },
      },
    ],
  },
  props: { kind: 'struct', fields: [field('done', 'boolean')] },
  states: [{ tag: 'Single', data: empty }],
  messages: [
    { tag: 'Ticked', description: 'Tick it done or not', payload: empty },
  ],
  workers: [],
  emits: [
    {
      tag: 'Toggled',
      payload: { kind: 'struct', fields: [field('id', 'text')] },
    },
  ],
  requires: [],
  provides: [],
  queries: [],
  children: [],
};

const list: Plan = {
  path: 'App/Ready:list',
  actor: 'List',
  model: { kind: 'struct', fields: [field('count', 'number')] },
  states: [{ tag: 'Single', data: empty }],
  messages: [
    {
      tag: 'Toggled',
      payload: { kind: 'struct', fields: [field('id', 'text')] },
    },
  ],
  workers: [{ name: 'sync', runs: 'each' }],
  emits: [],
  requires: ['Store'],
  provides: [],
  queries: [{ name: 'left', result: { kind: 'number' } }],
  children: [{ name: 'items', runs: 'each', keyed: false, plan: item }],
};

export const plan: Plan = {
  path: 'App',
  actor: 'App',
  description: 'A to-do list',
  model: empty,
  states: [
    { tag: 'Loading', data: empty },
    {
      tag: 'Ready',
      data: { kind: 'struct', fields: [field('since', 'number')] },
    },
  ],
  messages: [
    { tag: 'Loaded', payload: empty },
    {
      tag: 'Added',
      description: 'Add a to-do',
      payload: empty,
      state: 'Ready',
    },
  ],
  workers: [{ name: 'load', runs: 'while', state: 'Loading' }],
  emits: [],
  requires: [],
  provides: [{ name: 'Store', state: 'Ready' }],
  queries: [],
  children: [
    { name: 'list', state: 'Ready', runs: 'always', keyed: false, plan: list },
  ],
};
