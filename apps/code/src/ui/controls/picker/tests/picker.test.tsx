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
import { keys } from '../../../../device/account/connections/layout/commands.ts';
import { Frame, How, make } from '../picker.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A Picker under an owner, on the app's own keyboard: a fruit, then its
 * size, which the owner loads, a Step with no search. The page has an
 * editor as its default Focus Spot; every way the Picker closes puts focus
 * back in it, and the owner hears the choices once. It is drawn as the
 * input that opened it asks, whatever the device: keys, a centred list; a
 * mouse, a popover; a touch, the Picker Mode its opener chose, a Drawer
 * or a Sheet, where nothing focuses the search. The rest of the screen
 * dims behind each.
 */

// The Picker Mode the page opens it in.
let mode: 'drawer' | 'sheet' = 'sheet';

const Fruit = make('FruitPicker', {
  props: Schema.Struct({ ripe: Schema.Boolean }),
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
      search: false,
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
        mode={mode}
        label="Fruit"
        onOpen={onOpen}
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

  it('hints Mod+Enter to finish, its Steps going on', async () => {
    await openByKeys();
    expect(
      document.querySelector('[cmdk-root] > p[aria-hidden]')?.textContent,
    ).toContain('done');
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

  it('opens by a tap in its Picker Mode, nothing focused, keyboard or not', async () => {
    // As Chrome's device mode once a key was pressed: a keyboard, then a tap.
    document.documentElement.dataset['input'] = 'touch';
    await click(by('trigger'));
    delete document.documentElement.dataset['input'];
    expect(
      document.querySelector('[data-slot="touch-drawer"] [cmdk-input]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(search()).not.toBeNull();
    expect(document.activeElement).not.toBe(search());
  });

  it('opens centred, search focused, when Enter or Space on its button opens it', async () => {
    // A click with no pointer, after a key: as the browser makes for Enter.
    document.documentElement.dataset['input'] = 'keys';
    await act(async () => by('trigger').click());
    await flush();
    delete document.documentElement.dataset['input'];
    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(document.activeElement).toBe(search());
  });

  it('dims the screen behind it, opened by keys or by a mouse', async () => {
    await openByKeys();
    expect(
      document.querySelector('[data-slot="dialog-overlay"]'),
    ).not.toBeNull();
    await key('Escape');
    await click(by('trigger'));
    expect(
      document.querySelector('[data-slot="popover-backdrop"]'),
    ).not.toBeNull();
  });

  it('draws by how it was opened, whatever its Picker Mode', async () => {
    mode = 'drawer';
    await openByKeys();
    expect(document.querySelector('[data-slot="touch-drawer"]')).toBeNull();
    expect(
      document.querySelector('[data-slot="touch-drawer"] [cmdk-input]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeNull();
    mode = 'sheet';
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

describe('Picker, opened by touch', () => {
  beforeAll(() => {
    device = 'touch';
  });
  afterAll(() => {
    device = 'keyboard';
  });
  beforeEach(() => {
    // As the page keeps it: the input last used was a touch.
    document.documentElement.dataset['input'] = 'touch';
  });
  afterEach(() => {
    mode = 'sheet';
    delete document.documentElement.dataset['input'];
  });
  /** A tap on the trigger. */
  const openByTouch = async () => {
    await click(by('trigger'));
    expect(search() ?? document.querySelector('[cmdk-item]')).not.toBeNull();
  };
  const drawer = () => document.querySelector('[data-slot="touch-drawer"]');
  const title = () =>
    document.querySelector('[data-slot="layer-header"] h2')?.textContent;
  const button = (label: string) =>
    document.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
  /** A tap on the page outside the Picker. */
  const outside = async () => {
    await act(async () => {
      const target = document.body;
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup'])
        target.dispatchEvent(
          new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, {
            bubbles: true,
            button: 0,
          }),
        );
      target.click();
    });
    await flush();
  };
  const row = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find(
      (item) => item.textContent === label,
    )!;

  it('opens without focusing its search', async () => {
    await openByTouch();
    expect(document.activeElement).not.toBe(search());
    expect(rows()).toEqual(['Apple', 'Pear', 'PlumOut of season']);
    await click(row('Apple'));
    expect(rows()).toEqual(['Small', 'Large']);
    await click(row('Small'));
    await flush();
    expect(owner).toEqual({ chosen: ['apple', 'apple-small'], done: 1 });
  });

  it('reads a touch from the pointer that opened it, whatever was used last', async () => {
    delete document.documentElement.dataset['input'];
    await act(async () => {
      const tapped = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      Object.assign(tapped, { pointerType: 'pen' });
      by('trigger').dispatchEvent(tapped);
    });
    await flush();
    expect(drawer()).not.toBeNull();
  });

  it('opens centred by keys, even on touch', async () => {
    await openByKeys();
    expect(drawer()).toBeNull();
    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeNull();
  });

  it('draws the Picker Mode its opener chose, not the width', async () => {
    // A Sheet: a Drawer with a search.
    await openByTouch();
    expect(drawer()).not.toBeNull();
    expect(search()).not.toBeNull();
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    // Not Escape: a key pressed outside a field is a real keyboard.
    await outside();
    expect(drawer()).toBeNull();
    mode = 'drawer';
    await openByTouch();
    expect(drawer()).not.toBeNull();
    // A Drawer never has a search.
    expect(search()).toBeNull();
    expect(rows()).toEqual(['Apple', 'Pear', 'PlumOut of season']);
  });

  it('names each Step in its header, goes back from it, and hides the search of a Step without one', async () => {
    await openByTouch();
    expect(title()).toBe('Fruit');
    expect(button('Back')).toBeNull();
    await click(row('Pear'));
    expect(title()).toBe('Pear');
    expect(search()).toBeNull();
    expect(rows()).toEqual(['Small', 'Large']);
    await click(button('Back')!);
    expect(title()).toBe('Fruit');
    expect(search()?.placeholder).toBe('Search fruit');
  });

  it('closes on a tap outside, its search focused or not, with nothing chosen', async () => {
    await openByTouch();
    await act(async () => search()!.focus());
    await outside();
    expect(drawer()).toBeNull();
    expect(owner).toEqual({ chosen: null, done: 1 });
  });

  it('raises no keyboard in the tap that opens it', async () => {
    await act(async () => by('trigger').click());
    expect(document.activeElement).not.toBeInstanceOf(HTMLInputElement);
  });
});
