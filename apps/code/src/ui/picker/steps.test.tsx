// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { keys } from '../../keys.ts';
import { HOLD } from './actor.ts';
import { Frame, How, make, useOpen } from './picker.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A Picker that walks a tree of places, as the Project Picker walks
 * folders: a place is a Step of its own, a path typed goes there, text
 * that names nothing opens the walk searching it, Ctrl+L goes in, and
 * Mod+Enter chooses the place open, which the owner settles while the
 * Picker waits. Two of them on one page show that a Picker opened over
 * another keeps the keyboard when the first is dropped. On a device with
 * no keyboard, a button chooses the place open instead.
 */

const TREE: Readonly<Record<string, ReadonlyArray<string>>> = {
  '': ['a', 'b'],
  a: ['b', 'c'],
  'a/b': [],
  'a/c': [],
  b: [],
};

const Places = make('PlacePicker', {
  props: Schema.Struct({}),
  steps: {
    start: {
      placeholder: () => 'Search',
      rows: () => ({ rows: [{ value: 'here', label: 'Here' }] }),
      pinned: () => [{ value: 'walk', label: 'Walk…' }],
      next: (row, { query }) =>
        row.value === 'walk' ? { id: 'place', key: '', query } : null,
    },
    place: {
      placeholder: ({ key }) => `In ${key || 'the top'}`,
      next: (row) =>
        row.value.startsWith('new:') ? null : { id: 'place', key: row.value },
      goes: (query, { key }) => {
        if (!query.includes('/')) return null;
        const parts = query.split('/');
        const left = parts.pop() ?? '';
        const names = [...(key === '' ? [] : key.split('/')), ...parts];
        return {
          steps: names.map((name, at) => {
            const path = names.slice(0, at + 1).join('/');
            return {
              step: { id: 'place', key: path },
              value: path,
              label: name,
            };
          }),
          query: left,
        };
      },
      pinned: ({ query }, rows) =>
        query === '' || rows.some(({ label }) => label === query)
          ? []
          : [{ value: `new:${query}`, label: `Make ${query}` }],
      finishes: 'step',
      done: () => 'Choose this place',
      where: ({ key }) => `/${key}`,
      make: 'New place',
      settles: true,
    },
  },
});

const Which = Schema.Literals(['first', 'second']);

const OwnerModel = Schema.Struct({
  first: Schema.NullOr(How),
  second: Schema.NullOr(How),
  opened: Schema.Finite,
  settled: Schema.Array(Schema.String),
  heard: Schema.NullOr(Schema.String),
  pings: Schema.Finite,
});
type OwnerModel = typeof OwnerModel.Type;

const OwnerMessage = Schema.TaggedUnion({
  Ping: {},
  Open: { which: Which, how: How },
  Drop: { which: Which },
  Settled: { place: Schema.String },
  Heard: { place: Schema.NullOr(Schema.String) },
});

const Owner = Actor.define('PlaceOwner', {
  model: OwnerModel,
  message: OwnerMessage,
});

const child = (which: 'first' | 'second') => ({
  actor: Places.Live,
  while: ({ model }: { readonly model: OwnerModel }) => model[which] !== null,
  key: ({ model }: { readonly model: OwnerModel }) => String(model.opened),
  input: ({ model }: { readonly model: OwnerModel }) => ({
    how: model[which] ?? 'keys',
    step: { id: 'start', key: '' },
    choices: [],
  }),
  props: () => ({}),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({
    model: {
      first: null,
      second: null,
      opened: 0,
      settled: [],
      heard: null,
      pings: 0,
    },
  }),
  children: { first: child('first'), second: child('second') },
  provides: (self) =>
    Places.owner({
      done: (choices, step) =>
        self.send({
          _tag: 'Heard',
          place: choices === null ? null : (step?.key ?? ''),
        }),
      load: ({ key }) =>
        Effect.succeed({
          rows: (TREE[key] ?? []).map((name) => ({
            value: key === '' ? name : `${key}/${name}`,
            label: name,
          })),
          truncated: false,
          problem: null,
        }),
      make: ({ key }, name) =>
        Effect.succeed(
          name === 'taken'
            ? { refused: 'Already there' }
            : {
                row: {
                  value: key === '' ? name : `${key}/${name}`,
                  label: name,
                },
              },
        ),
      settle: (choices, { key }) => {
        // The owner shows something over the place b: the Picker holds.
        if (key === 'b') return Effect.succeed(HOLD);
        const made = choices.at(-1)?.value ?? '';
        if (made === 'new:bad') return Effect.succeed('Not a good name');
        return Effect.as(self.send({ _tag: 'Settled', place: key }), null);
      },
    }),
  on: {
    Ping: (_, { model }) => ({ model: { ...model, pings: model.pings + 1 } }),
    Open: ({ which, how }, { model }) => ({
      model: { ...model, [which]: how, opened: model.opened + 1 },
    }),
    Drop: ({ which }, { model }) => ({ model: { ...model, [which]: null } }),
    Settled: ({ place }, { model }) => ({
      model: { ...model, settled: [...model.settled, place] },
    }),
    Heard: ({ place }, { model }) => ({
      model: { ...model, first: null, second: null, heard: place },
    }),
  },
});

let state = {
  settled: [] as ReadonlyArray<string>,
  heard: null as string | null,
};
let send: (message: typeof OwnerMessage.Type) => void = () => {};
let pings = 0;

function Page({ children }: { readonly children: ReactNode }) {
  const spot = keys.useFocusSpot('content', 'page', { default: true });
  const open = useOpen();
  return (
    <keys.Surface id="content">
      <div ref={spot} tabIndex={0} data-testid="editor" />
      {(['first', 'second'] as const).map((which) => (
        <button
          key={which}
          type="button"
          data-testid={which}
          // A tap on touch; else as its keys open it.
          onClick={() =>
            open(() =>
              send({
                _tag: 'Open',
                which,
                how: device === 'touch' ? 'touch' : 'keys',
              }),
            )
          }
        />
      ))}
      {children}
    </keys.Surface>
  );
}

const OwnerView = View.make(OwnerLive, ({ model, children, send: own }) => {
  state = { settled: model.settled, heard: model.heard };
  send = own;
  pings = model.pings;
  return (
    <keys.Provider vim>
      <Page>
        <Frame how={model.first} mode="sheet" label="First">
          {children.first && <Places.View instance={children.first} />}
        </Frame>
        <Frame how={model.second} mode="sheet" label="Second">
          {children.second && <Places.View instance={children.second} />}
        </Frame>
      </Page>
    </keys.Provider>
  );
});

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const by = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].map(
    (item) => item.textContent,
  );
const trail = () => document.querySelector('nav')?.textContent ?? '';

const key = async (name: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    for (const type of ['keydown', 'keyup'])
      target.dispatchEvent(
        new KeyboardEvent(type, {
          key: name,
          code: name.length === 1 ? `Key${name.toUpperCase()}` : name,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
  });
  await flush();
};

const type = async (text: string) => {
  const input = search()!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
};

const click = async (element: HTMLElement) => {
  await act(async () => element.click());
  await flush();
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// What the device can be driven by: a keyboard, else touch alone.
let device: 'keyboard' | 'touch' = 'keyboard';

beforeEach(async () => {
  document.documentElement.toggleAttribute(
    'data-keyboard',
    device === 'keyboard',
  );
  const App = toReact(OwnerLive, OwnerView, Layer.empty, {
    name: `steps-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => send({ _tag: 'Ping' }));
    await flush();
  }
  by('editor').focus();
  await click(by('first'));
  expect(search()).not.toBeNull();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Picker Steps', () => {
  it('opens the next Step searching text that names no row, from a pinned row', async () => {
    await type('zz');
    expect(rows()).toEqual(['Walk…']);
    await key('Enter');
    expect(search()?.value).toBe('zz');
    expect(rows()).toEqual(['Make zz']);
  });

  it('goes to the place a typed path names, searching what follows it', async () => {
    await key('ArrowDown');
    await key('Enter');
    await type('a/c');
    expect(trail()).toContain('a');
    expect(search()?.value).toBe('c');
    expect(rows()[0]).toBe('c');
  });

  it('goes into the highlighted row on Ctrl+L, and finishes on the highlighted row on Mod+Enter, once settled', async () => {
    await key('ArrowDown');
    await key('Enter');
    await key('l', { ctrlKey: true });
    expect(search()?.placeholder).toBe('In a');
    // A row that finishes is not gone into.
    await type('new');
    await key('l', { ctrlKey: true });
    expect(search()?.placeholder).toBe('In a');
    await type('');
    expect(rows()).toEqual(['b', 'c']);
    await key('ArrowDown');
    await key('Enter', { ctrlKey: true });
    await flush();
    expect(state).toEqual({ settled: ['a/c'], heard: 'a/c' });
    expect(search()).toBeNull();
    expect(document.activeElement).toBe(by('editor'));
  });

  it('says why the owner refused, and stays open to choose again', async () => {
    await key('ArrowDown');
    await key('Enter');
    await type('bad');
    await key('Enter');
    await flush();
    expect(document.body.textContent).toContain('Not a good name');
    expect(search()).not.toBeNull();
    expect(state.heard).toBeNull();
  });

  it('keeps the keyboard in a Picker opened over another as that one is dropped', async () => {
    await click(by('second'));
    await act(async () => send({ _tag: 'Drop', which: 'first' }));
    await flush();
    expect(search()).not.toBeNull();
    expect(document.activeElement).toBe(search());
    await key('Escape');
    await flush();
    expect(search()).toBeNull();
    expect(document.activeElement).toBe(by('editor'));
  });
});

describe('Picker Steps, on a device with no keyboard', () => {
  beforeAll(() => {
    device = 'touch';
  });
  afterAll(() => {
    device = 'keyboard';
  });
  const row = (value: string) =>
    [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find(
      (item) => item.getAttribute('data-value') === value,
    )!;
  const done = () =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Choose this place',
    );

  it('goes into a place by its row, and chooses the one open by the button under its path', async () => {
    expect(done()).toBeUndefined();
    await click(row('walk'));
    await click(row('a'));
    expect(rows()).toEqual(['b', 'c']);
    expect(document.body.textContent).toContain('/a');
    await click(done()!);
    await flush();
    expect(state).toEqual({ settled: ['a'], heard: 'a' });
    expect(search()).toBeNull();
  });

  const button = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (each) => each.textContent === text,
    );
  const named = () =>
    document.querySelector<HTMLInputElement>(
      'input[aria-label="Name of the new folder"]',
    )!;
  const name = async (text: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(named(), text);
      named().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
  };

  it('makes a new place where it is and goes into it, or says why not', async () => {
    await click(row('walk'));
    await click(row('a'));
    await click(button('New place')!);
    await name('taken');
    await click(button('Create')!);
    expect(document.body.textContent).toContain('Already there');
    await name('d');
    await click(button('Create')!);
    // In the place made, which the button under its path chooses.
    expect(document.body.textContent).toContain('/a/d');
    await click(done()!);
    await flush();
    expect(state).toEqual({ settled: ['a/d'], heard: 'a/d' });
  });

  it('holds where it is when its owner shows something over it, to be chosen from again', async () => {
    await click(row('walk'));
    await click(row('b'));
    await click(done()!);
    await flush();
    expect(state).toEqual({ settled: [], heard: null });
    // Still open on b, and not waiting: it can be chosen from again.
    expect(document.body.textContent).toContain('/b');
    expect(done()?.disabled).toBe(false);
  });
});
