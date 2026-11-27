import { describe, expect, it } from 'vitest';
import type { Plan } from '@kestack/devtools-kabuki/devtools';
import {
  connectorsOf,
  pictureOf,
  promptOf,
  refsOf,
  rowsOf,
  shownOf,
  skeletonOf,
  titleOf,
  turnsOf,
} from '../logic/shared/index.js';
import { questionOf } from '../logic/shared/selectors/prompt.js';
import { schemaOf, treeOf } from '../logic/updates.js';
import { durationOf } from '../logic/workers.js';
import { plan } from './plan.js';

const list = plan.children[0]!.plan;
const item = list.children[0]!.plan;

interface Schemed {
  readonly type?: string;
  readonly enum?: ReadonlyArray<string>;
  readonly required?: ReadonlyArray<string>;
  readonly items?: Schemed;
  readonly properties?: Readonly<Record<string, Schemed>>;
}

describe('the Blueprint as the Agent reads it', () => {
  it('prints each actor by its levels: its model keys, Always, then each State with its data keys and what it runs and takes', () => {
    expect(treeOf(plan)).toBe(
      [
        'App — A to-do list',
        '  always:',
        '    messages: message:Loaded',
        '  state:Loading',
        '    workers: worker:load',
        '  state:Ready { since }',
        '    messages: message:Added',
        '    children: child:list',
        '    provides: Store',
        '  App/Ready:list',
        '    model: count',
        '    always:',
        '      workers: worker:sync',
        '      messages: message:Toggled { id }',
        '      children: child:items',
        '      queries: left',
        '      requires: Store',
        '    App/Ready:list/items — One to-do',
        '      model: title, tags, tags.label, tags.tone',
        '      always:',
        '        messages: message:Ticked',
        '        emits: emits:Toggled { id }',
        '        input: id',
        '        props: done',
      ].join('\n'),
    );
  });

  it('offers every ref of an actor, each level item by its bare name, and no States for an Actor with one State', () => {
    expect(refsOf(plan)).toEqual([
      'description',
      'state:Loading',
      'state:Ready',
      'state:Ready.since',
      'worker:load',
      'message:Loaded',
      'message:Added',
      'child:list',
      'provides',
    ]);
    expect(refsOf(list)).toEqual([
      'model',
      'model.count',
      'worker:sync',
      'message:Toggled',
      'message:Toggled.id',
      'child:items',
      'requires',
      'queries',
    ]);
  });

  it('answers in a JSON Schema whose actors and refs are only the real ones', () => {
    const schema = schemaOf(plan) as Schemed;
    const beat = schema.properties!['beats']!.items!;
    const shown = beat.properties!['show']!.items!;
    const link = beat.properties!['links']!.items!.properties!;
    const paths = ['App', 'App/Ready:list', 'App/Ready:list/items'];
    expect(schema.required).toEqual(['title', 'beats']);
    expect(beat.required).toEqual(['say', 'focus', 'show']);
    expect(beat.properties!['focus']!.enum).toEqual(paths);
    expect(shown.required).toEqual(['actor', 'lit']);
    expect(shown.properties!['actor']!.enum).toEqual(paths);
    expect(link['from']!.enum).toEqual(paths);
    expect(shown.properties!['lit']!.items!.enum).toEqual(
      expect.arrayContaining([
        'state:Loading',
        'worker:load',
        'message:Toggled.id',
        'emits:Toggled',
        'props.done',
        'model.tags.label',
      ]),
    );
  });
});

describe('a question', () => {
  it('carries its chips, and the Blueprint only when given, and reads back as it was asked', () => {
    const asked = {
      question: 'How is a to-do saved?',
      chips: ['App/Ready:list · workers'],
    };
    const first = promptOf(asked, treeOf(plan));
    expect(first).toContain(
      'How is a to-do saved?\nAbout: App/Ready:list · workers',
    );
    expect(first).toContain(treeOf(plan));
    expect(questionOf(first)).toEqual(asked);

    const next = promptOf({ question: 'And deleted?', chips: [] }, null);
    expect(next).toBe('And deleted?');
    expect(questionOf(next)).toEqual({ question: 'And deleted?', chips: [] });
  });
});

describe('a Beat', () => {
  const twice: Plan = {
    ...plan,
    workers: [...plan.workers, { name: 'load', runs: 'while', state: 'Ready' }],
  };

  it('lights refs at their own level and opens the State they are in', () => {
    const picture = pictureOf(plan, {
      focus: 'App',
      show: [
        { actor: 'App', lit: ['worker:load', 'state:Ready.since'] },
        { actor: 'App/Ready:list', lit: ['message:Toggled.id', 'child:items'] },
      ],
      links: [{ from: 'App', to: 'App/Ready:list', label: 'places' }],
    });
    expect(picture.missing).toEqual([]);
    expect(picture.focus?.actor).toBe('App');
    const app = picture.cards.get('App')!;
    expect([...app.refs]).toEqual([
      'state:Loading/worker:load',
      'state:Ready.since',
    ]);
    expect([...app.expanded]).toEqual(['Loading', 'Ready']);
    const lit = picture.cards.get('App/Ready:list')!;
    expect([...lit.refs]).toEqual(['message:Toggled.id', 'child:items']);
    expect([...lit.expanded]).toEqual([]);
    expect(picture.links).toEqual([{ from: plan, to: list, label: 'places' }]);
    expect(
      pictureOf(plan, { show: [shownOf(lit)] }).cards.get(list.path),
    ).toEqual(lit);
  });

  it('lights a name at every level it is at, or at one when written with its State', () => {
    const lit = (ref: string) => [
      ...pictureOf(twice, { show: [{ actor: 'App', lit: [ref] }] }).cards.get(
        'App',
      )!.refs,
    ];
    expect(lit('worker:load')).toEqual([
      'state:Loading/worker:load',
      'state:Ready/worker:load',
    ]);
    expect(lit('state:Ready/worker:load')).toEqual(['state:Ready/worker:load']);
    expect(refsOf(twice)).toEqual(
      expect.arrayContaining([
        'state:Loading/worker:load',
        'state:Ready/worker:load',
      ]),
    );
  });

  it('names each ref the Blueprint does not have, and still lights the rest', () => {
    const picture = pictureOf(plan, {
      focus: 'App/Gone',
      show: [
        { actor: 'App/Gone', lit: ['model'] },
        {
          actor: 'App/Ready:list',
          lit: [
            'model.count',
            'state:Ready',
            'message:Nope',
            'message:Toggled.nope',
            'worker:sync.id',
          ],
        },
      ],
      links: [{ from: 'App', to: 'App/Elsewhere' }],
    });
    expect(picture.focus).toBeNull();
    expect(picture.missing).toEqual([
      'App/Gone',
      'App/Ready:list · state:Ready',
      'App/Ready:list · message:Nope',
      'App/Ready:list · message:Toggled.nope',
      'App/Ready:list · worker:sync.id',
      'App → App/Elsewhere',
    ]);
    expect([...picture.cards.get('App/Ready:list')!.refs]).toEqual([
      'model.count',
    ]);
  });

  it('plays for as long as its words take to read, within bounds', () => {
    expect(durationOf('Short.')).toBe(2500);
    expect(durationOf(Array.from({ length: 20 }, () => 'word').join(' '))).toBe(
      1200 + 20 * 280,
    );
    expect(durationOf('word '.repeat(200))).toBe(12000);
  });
});

describe('a Thread read as turns', () => {
  it('pairs each question with its answer, and keeps the last run with its activity', () => {
    const answer = {
      title: 'Saving',
      beats: [{ say: 'It starts.', focus: 'App', show: [] }],
    };
    const { turns, run } = turnsOf([
      {
        _tag: 'User',
        text: promptOf({ question: 'How?', chips: [] }, 'tree'),
        at: 1,
      },
      { _tag: 'Status', status: 'running', at: 1 },
      { _tag: 'Activity', text: 'Reading src/app.ts', at: 2 },
      { _tag: 'Assistant', data: answer, at: 3 },
      { _tag: 'Status', status: 'done', at: 3 },
      { _tag: 'User', text: 'And then?', at: 4 },
      { _tag: 'Status', status: 'running', at: 4 },
      { _tag: 'Status', status: 'failed', reason: 'No network.', at: 5 },
    ]);
    expect(turns).toEqual([
      { question: 'How?', chips: [], answer, text: null },
      { question: 'And then?', chips: [], answer: null, text: null },
    ]);
    expect(run).toEqual({
      status: 'failed',
      reason: 'No network.',
      since: 4,
      activity: [],
    });
    expect(titleOf(turns)).toBe('Saving');
  });

  it('keeps an answer that is not Beats as its text', () => {
    const { turns } = turnsOf([
      { _tag: 'User', text: 'Hi', at: 1 },
      { _tag: 'Assistant', text: 'Hello', data: { nope: true }, at: 2 },
    ]);
    expect(turns[0]).toMatchObject({ answer: null, text: 'Hello' });
    expect(titleOf(turns)).toBe('Hi');
  });
});

describe('a Shape on a card', () => {
  it('is its keys, each with its description when it has one, nested ones indented', () => {
    expect(rowsOf(item.model)).toEqual([
      {
        id: 'title',
        name: 'title',
        depth: 0,
        description: 'What the to-do says',
      },
      { id: 'tags', name: 'tags', depth: 0 },
      { id: 'tags.label', name: 'label', depth: 1 },
      { id: 'tags.tone', name: 'tone', depth: 1 },
    ]);
    expect(rowsOf({ kind: 'struct', fields: [] })).toEqual([]);
  });
});

describe('a card', () => {
  const card = (lit: ReadonlyArray<string>, of: Plan = plan) =>
    skeletonOf(
      of,
      pictureOf(of, { show: [{ actor: of.path, lit }] }).cards.get(of.path)!,
    );

  it('is always the same skeleton: model keys, Always, then one row per State, collapsed with a count', () => {
    const app = card([]);
    expect(app.model).toEqual([]);
    expect(app.always.groups.map(({ title }) => title)).toEqual(['Messages']);
    expect(
      app.states.map(({ tag, expanded, count }) => ({ tag, expanded, count })),
    ).toEqual([
      { tag: 'Loading', expanded: false, count: '1 worker' },
      { tag: 'Ready', expanded: false, count: '1 message · 1 child' },
    ]);
    expect(card([], list).always.groups.map(({ title }) => title)).toEqual([
      'Workers',
      'Messages',
      'Children',
      'Requires',
      'Queries',
    ]);
  });

  it('keeps each level to itself: a State shows its own data, Workers, Messages and Children once expanded', () => {
    const [loading, ready] = card(['worker:load', 'state:Ready']).states;
    expect(loading).toMatchObject({ lit: false, expanded: true });
    expect(loading!.groups).toMatchObject([
      { title: 'Workers', lines: [{ name: 'load', lit: true }] },
    ]);
    expect(ready).toMatchObject({ lit: true, expanded: true });
    expect(ready!.data).toEqual([
      expect.objectContaining({ name: 'since', lit: true }),
    ]);
    expect(ready!.groups.map(({ title }) => title)).toEqual([
      'Messages',
      'Children',
      'Provides',
    ]);
  });

  it('shows payload keys only under a lit Message, and a description only for a lit key or under a lit parent', () => {
    const toggled = (lit: ReadonlyArray<string>) =>
      card(lit, list).always.groups[1]!.lines[0]!;
    expect(toggled([])).toMatchObject({
      name: 'Toggled',
      lit: false,
      keys: [],
    });
    expect(toggled(['message:Toggled']).keys).toMatchObject([
      { name: 'id', lit: true },
    ]);
    expect(
      card(['model.tags.label'], item).model.map(
        ({ name, lit, description }) => [name, lit, description],
      ),
    ).toEqual([
      ['title', false, null],
      ['tags', false, null],
      ['label', true, null],
      ['tone', false, null],
    ]);
    expect(card(['model'], item).model[0]).toMatchObject({
      lit: true,
      description: 'What the to-do says',
    });
  });
});

describe('the connectors between cards', () => {
  const connectors = (scene: Parameters<typeof pictureOf>[1], story = true) =>
    connectorsOf(plan, pictureOf(plan, scene), story);

  it('are one per parent and child, quiet unless lit', () => {
    const all = connectors({ show: [{ actor: 'App', lit: [] }] });
    expect(all).toEqual([
      {
        from: 'App',
        to: 'App/Ready:list',
        tree: true,
        lit: false,
        quiet: true,
        chips: [],
      },
      {
        from: 'App/Ready:list',
        to: 'App/Ready:list/items',
        tree: true,
        lit: false,
        quiet: true,
        chips: [],
      },
    ]);
  });

  it('light the tree edge for a link between a parent and its child, its labels stacked on it with their direction', () => {
    const [, edge, ...rest] = connectors({
      show: [],
      links: [
        { from: 'App/Ready:list', to: 'App/Ready:list/items', label: 'done' },
        {
          from: 'App/Ready:list/items',
          to: 'App/Ready:list',
          label: 'Toggled',
        },
      ],
    });
    expect(rest).toEqual([]);
    expect(edge).toMatchObject({
      from: 'App/Ready:list',
      to: 'App/Ready:list/items',
      tree: true,
      lit: true,
      chips: [
        { label: 'done', mark: '↓' },
        { label: 'Toggled', mark: '↑' },
      ],
    });
  });

  it('draw their own curve only between cards with no tree edge, and light a tree edge when its Child is lit', () => {
    const all = connectors(
      {
        show: [
          { actor: 'App', lit: ['child:list'] },
          { actor: 'App/Ready:list', lit: [] },
        ],
        links: [{ from: 'App/Ready:list/items', to: 'App' }],
      },
      false,
    );
    expect(all[0]).toMatchObject({ lit: true, quiet: false, chips: [] });
    expect(all[2]).toEqual({
      from: 'App/Ready:list/items',
      to: 'App',
      tree: false,
      lit: true,
      quiet: false,
      chips: [{ label: null, mark: '→' }],
    });
  });
});
