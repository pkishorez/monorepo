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
import { Frame, How, make } from './picker.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A Picker under an owner, on the app's own keyboard: a fruit, then its
 * size, which the owner loads. The page has an editor as its default Focus
 * Spot; every way the Picker closes puts focus back in it, and the owner
 * hears the choices once. On a device with no keyboard, where the app's
 * keyboard moves no focus, nothing focuses the search unless it opts in.
 */

let optIn = false;

const Fruit = make('FruitPicker', {
  props: Schema.Struct({ ripe: Schema.Boolean }),
  get focusOnTouch() {
    return optIn;
  },
  steps: {
    fruit: {
      placeholder: () => 'Search fruit',
      rows: () => ({
        rows: [
          { value: 'apple', label: 'Apple' },
          { value: 'pear', label: 'Pear' },
          { value: 'plum', label: 'Plum', unavailable: 'Out of season' },
        ],
      }),
      next: (row) => ({ id: 'size', key: row.value }),
    },
    size: {
      placeholder: ({ key }) => `Search sizes of ${key}`,
      next: () => null,
    },
  },
});

const Owner = Actor.define('Owner', {
  model: Schema.Struct({
    picking: Schema.NullOr(How),
    opened: Schema.Finite,
    chosen: Schema.NullOr(Schema.Array(Schema.String)),
    done: Schema.Finite,
    pings: Schema.Finite,
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    Drop: {},
    Open: { how: How },
    Done: { values: Schema.NullOr(Schema.Array(Schema.String)) },
  }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({
    model: { picking: null, opened: 0, chosen: null, done: 0, pings: 0 },
  }),
  children: {
    picker: {
      actor: Fruit.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: { id: 'fruit', key: '' },
        choices: [],
      }),
      props: () => ({ ripe: true }),
    },
  },
  provides: (self) =>
    Fruit.owner({
      done: (choices) =>
        self.send({
          _tag: 'Done',
          values: choices?.map(({ value }) => value) ?? null,
        }),
      load: ({ key }) =>
        Effect.succeed({
          rows: [
            { value: `${key}-small`, label: 'Small' },
            { value: `${key}-large`, label: 'Large' },
          ],
          truncated: false,
          problem: null,
        }),
    }),
  on: {
    Ping: (_, { model }) => ({ model: { ...model, pings: model.pings + 1 } }),
    Drop: (_, { model }) => ({ model: { ...model, picking: null } }),
    Open: ({ how }, { model }) =>
      model.picking !== null
        ? {}
        : { model: { ...model, picking: how, opened: model.opened + 1 } },
    Done: ({ values }, { model }) => ({
      model: { ...model, picking: null, chosen: values, done: model.done + 1 },
    }),
  },
});

function Page({
  how,
  onOpen,
  children,
}: {
  readonly how: typeof How.Type | null;
  readonly onOpen: (how: typeof How.Type) => void;
  readonly children: ReactNode;
}) {
  const { enter } = keys.useKeyboard();
  const spot = keys.useFocusSpot('content', 'page', { default: true });
  return (
    <keys.Surface id="content">
      <div ref={spot} tabIndex={0} data-testid="editor" />
      <button
        type="button"
        data-testid="slash"
        onClick={() => {
          onOpen('keys');
          enter('picker');
        }}
      />
      <Frame
        how={how}
        label="Fruit"
        onOpen={() => onOpen('pointer')}
        trigger={
          <button type="button" data-testid="trigger">
            Fruit
          </button>
        }
      >
        {children}
      </Frame>
    </keys.Surface>
  );
}

let owner: { chosen: ReadonlyArray<string> | null; done: number } = {
  chosen: null,
  done: 0,
};
let ping = () => {};
let drop = () => {};
let pings = 0;
let bindings: Readonly<Record<string, string>> = {};
// What the device can be driven by: a keyboard, else touch alone.
let device: 'keyboard' | 'touch' = 'keyboard';

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  owner = { chosen: model.chosen, done: model.done };
  ping = () => send({ _tag: 'Ping' });
  drop = () => send({ _tag: 'Drop' });
  pings = model.pings;
  return (
    // As the app's keyboard: focus moves on its own only with a keyboard.
    <keys.Provider vim bindings={bindings} autoFocus={device === 'keyboard'}>
      <Page how={model.picking} onOpen={(how) => send({ _tag: 'Open', how })}>
        {children.picker && <Fruit.View instance={children.picker} />}
      </Page>
    </keys.Provider>
  );
});

let apps = 0;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));

const by = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].map(
    (item) => item.textContent,
  );

const key = async (name: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        code: name.length === 1 ? `Key${name.toUpperCase()}` : name,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: name,
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
  await act(async () => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    element.click();
  });
  await flush();
};

/** Waits until the Runtime has started: a Send is handled. */
const started = async () => {
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(pings).toBeGreaterThan(0);
};

/** Opens the Picker by keys, as a `/` in the Composer does. */
const openByKeys = async () => {
  await click(by('slash'));
  expect(search()).not.toBeNull();
};

let root: ReactRoot | undefined;

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(async () => {
  owner = { chosen: null, done: 0 };
  bindings = {};
  document.documentElement.toggleAttribute(
    'data-keyboard',
    device === 'keyboard',
  );
  // A History is kept under its app's name across mounts: one name each.
  const App = toReact(OwnerLive, OwnerView, Layer.empty, {
    name: `picker-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  await started();
  by('editor').focus();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('Picker', () => {
  it('opens by keys at its first Step, the search focused', async () => {
    await openByKeys();
    expect(document.activeElement).toBe(search());
    expect(rows()).toEqual(['Apple', 'Pear', 'PlumOut of season']);
  });

  it('opens the next Step on Enter, loads it, and finishes there, focus back in the editor', async () => {
    await openByKeys();
    await key('Enter');
    expect(search()?.placeholder).toBe('Search sizes of apple');
    expect(rows()).toEqual(['Small', 'Large']);
    expect(document.querySelector('nav')?.textContent).toBe('Apple');
    await key('ArrowDown');
    await key('Enter');
    await flush();
    expect(owner).toEqual({ chosen: ['apple', 'apple-large'], done: 1 });
    expect(search()).toBeNull();
    expect(document.activeElement).toBe(by('editor'));
  });

  it('finishes on the highlighted row with Mod+Enter', async () => {
    await openByKeys();
    await type('pea');
    expect(rows()).toEqual(['Pear']);
    // Not an Apple platform here: Mod is Ctrl.
    await key('Enter', { ctrlKey: true });
    await flush();
    expect(owner).toEqual({ chosen: ['pear'], done: 1 });
    expect(document.activeElement).toBe(by('editor'));
  });

  it('finishes on the keys the user bound in place of Mod+Enter', async () => {
    bindings = { 'picker.finish': 'ctrl+d' };
    await act(async () => ping());
    await openByKeys();
    await key('Enter', { ctrlKey: true });
    expect(owner.done).toBe(0);
    await key('d', { ctrlKey: true });
    await flush();
    expect(owner).toEqual({ chosen: ['apple'], done: 1 });
  });

  it('moves the highlight with Ctrl+N and Ctrl+P, round the ends', async () => {
    await openByKeys();
    const highlighted = () =>
      document.querySelector('[cmdk-item][data-selected="true"]')?.textContent;
    expect(highlighted()).toBe('Apple');
    await key('n', { ctrlKey: true });
    expect(highlighted()).toBe('Pear');
    // Plum cannot be chosen: the highlight goes round to Apple.
    await key('n', { ctrlKey: true });
    expect(highlighted()).toBe('Apple');
    await key('p', { ctrlKey: true });
    expect(highlighted()).toBe('Pear');
  });

  it('leaves its Surface when its owner drops it while open', async () => {
    await openByKeys();
    expect(document.activeElement).toBe(search());
    await act(async () => drop());
    await flush();
    expect(search()).toBeNull();
    expect(document.activeElement).toBe(by('editor'));
    // The keyboard is back on the page: the Picker's keys do nothing.
    await click(by('slash'));
    expect(search()).not.toBeNull();
  });

  it('goes back a Step on Backspace in an empty search', async () => {
    await openByKeys();
    await key('ArrowDown');
    await key('Enter');
    expect(search()?.placeholder).toBe('Search sizes of pear');
    await key('Backspace');
    expect(search()?.placeholder).toBe('Search fruit');
    expect(
      document.querySelector('[cmdk-item][data-selected="true"]')?.textContent,
    ).toBe('Pear');
  });

  it('clears the search on Escape, then closes, with nothing chosen', async () => {
    await openByKeys();
    await type('pea');
    await key('Escape');
    expect(search()?.value).toBe('');
    await key('Escape');
    await flush();
    expect(search()).toBeNull();
    expect(owner).toEqual({ chosen: null, done: 1 });
    expect(document.activeElement).toBe(by('editor'));
  });

  it('never picks a row that cannot be chosen', async () => {
    await openByKeys();
    await type('plum');
    await key('Enter');
    expect(owner.done).toBe(0);
    expect(search()).not.toBeNull();
  });

  it('opens by pointer from its trigger, and gives focus back to the editor', async () => {
    await click(by('trigger'));
    expect(search()).not.toBeNull();
    expect(
      document.querySelector('[data-slot="popover-content"]'),
    ).not.toBeNull();
    await key('Enter');
    await key('Enter');
    await flush();
    expect(owner).toEqual({ chosen: ['apple', 'apple-small'], done: 1 });
    expect(document.activeElement).toBe(by('editor'));
  });
});

describe('Picker, on a device with no keyboard', () => {
  beforeAll(() => {
    device = 'touch';
  });
  afterAll(() => {
    device = 'keyboard';
    optIn = false;
  });
  const row = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find(
      (item) => item.textContent === label,
    )!;

  it('opens without focusing its search, however it was opened', async () => {
    await openByKeys();
    expect(document.activeElement).not.toBe(search());
    expect(rows()).toEqual(['Apple', 'Pear', 'PlumOut of season']);
    await click(row('Apple'));
    expect(search()?.placeholder).toBe('Search sizes of apple');
    expect(document.activeElement).not.toBe(search());
    await click(row('Small'));
    await flush();
    expect(owner).toEqual({ chosen: ['apple', 'apple-small'], done: 1 });
    await click(by('trigger'));
    expect(search()).not.toBeNull();
    expect(document.activeElement).not.toBe(search());
  });

  it('focuses its search as it opens when the Picker opts in', async () => {
    optIn = true;
    await openByKeys();
    await flush();
    expect(document.activeElement).toBe(search());
  });
});
