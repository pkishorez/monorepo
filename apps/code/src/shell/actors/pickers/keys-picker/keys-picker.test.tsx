// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Layer, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { keys } from '../../../../keys.ts';
import { rowsOf } from './actor.ts';
import { KeysPickerLive } from './actor.ts';
import { KeysPickerView } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Keys Picker, opened from the page or the sidebar, out of Vim Mode or
 * in it, with the sidebar's key rebound. It lists only what works there,
 * finds a row by its name or its keys, and choosing one runs its Action
 * once the keyboard is back where it was.
 */

const BINDINGS = { 'app.sidebarAnywhere': ['ctrl+shift+b'] };

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    keysPicker: {
      actor: KeysPickerLive,
      props: () => ({ bindings: BINDINGS }),
    },
  },
  on: {
    Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }),
  },
});

let vim = false;
let toggled: Array<string> = [];
let pings = 0;
let ping = () => {};
let active = '';

function Places() {
  active = keys.useKeyboard().active;
  const row = keys.useFocusSpot('sidebar', 'row', { default: true });
  const page = keys.useFocusSpot('content', 'page', { default: true });
  keys.useAction('app.sidebar', () => toggled.push(active));
  keys.useAction('app.sidebarAnywhere', () => toggled.push(active));
  keys.useAction('app.theme', () => {});
  keys.useAction('sidebar.next', () => {});
  return (
    <>
      <keys.Surface id="sidebar">
        <button type="button" ref={row}>
          A row
        </button>
      </keys.Surface>
      <keys.Surface id="content">
        <div ref={page} tabIndex={0} data-testid="page" />
      </keys.Surface>
    </>
  );
}

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim={vim} bindings={BINDINGS}>
      <Places />
      <KeysPickerView instance={children.keysPicker} />
    </keys.Provider>
  );
});

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].map(
    (item) => item.querySelector('.font-medium')?.textContent,
  );
const rowOf = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find(
    (item) => item.querySelector('.font-medium')?.textContent === label,
  )!;

const key = async (name: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key: name, bubbles: true, ...init }),
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

const mount = async (on: boolean, at: 'sidebar' | 'content') => {
  vim = on;
  toggled = [];
  pings = 0;
  const App = toReact(OwnerLive, OwnerView, Layer.empty, {
    name: `keys-picker-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  const place =
    at === 'sidebar'
      ? [...document.querySelectorAll<HTMLElement>('button')].find(
          (each) => each.textContent === 'A row',
        )!
      : document.querySelector<HTMLElement>('[data-testid="page"]')!;
  await act(async () => {
    place.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    place.focus();
  });
  await flush();
  expect(active).toBe(at);
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('rowsOf', () => {
  it('gives each Action that works its label and its keys in either Mode, under the Bindings', () => {
    const listed = rowsOf({
      bindings: BINDINGS,
      available: ['app.sidebarAnywhere', 'app.settings', 'app.helpAnywhere'],
      vim: false,
    });
    expect(listed).toEqual([
      {
        value: 'app.settings',
        label: 'Settings, or back from them',
        group: 'Open',
        keys: { out: ['ctrl+,'], vim: [], on: 'out' },
      },
      {
        value: 'app.sidebarAnywhere',
        label: 'Show or hide the sidebar',
        group: 'Move around',
        keys: { out: ['ctrl+shift+b'], vim: ['b'], on: 'out' },
      },
    ]);
  });

  it('splits a row of several Actions into one each, and lights the Vim keys in Vim Mode', () => {
    const listed = rowsOf({
      bindings: {},
      available: ['app.side', 'app.sideAnywhere', 'app.back'],
      vim: true,
    });
    expect(listed).toEqual([
      {
        value: 'app.sideAnywhere',
        label: 'Go to the sidebar',
        group: 'Move around',
        keys: { out: ['ctrl+h'], vim: ['h'], on: 'vim' },
      },
      {
        value: 'app.back',
        label: 'Back to the last page',
        group: 'Move around',
        keys: { out: ['ctrl+o'], vim: [], on: 'vim' },
      },
    ]);
  });
});

describe('Keys Picker', () => {
  it('opens by Ctrl+? out of Vim Mode with only what works on the page, its own keys lit', async () => {
    await mount(false, 'content');
    await key('?', { ctrlKey: true, shiftKey: true });
    expect(document.activeElement).toBe(search());
    const listed = rows();
    expect(listed).toContain('Show or hide the sidebar');
    // Vim Mode's alone, and the sidebar's, work nowhere here.
    expect(listed).not.toContain('Switch theme');
    expect(listed).not.toContain('Next row');
    expect(listed).not.toContain('Show the keys');
    const [out, plain] = rowOf('Show or hide the sidebar').querySelectorAll(
      '[data-lit]',
    );
    expect(out!.getAttribute('data-lit')).toBe('true');
    expect(out!.textContent).toMatch(/B/);
    expect(plain!.getAttribute('data-lit')).toBe('false');
    expect(plain!.textContent).toBe('B');
  });

  it('opens by `?` in Vim Mode from the sidebar, with its rows and the Vim keys lit', async () => {
    await mount(true, 'sidebar');
    await key('?', { shiftKey: true });
    expect(document.activeElement).toBe(search());
    const listed = rows();
    expect(listed).toContain('Next row');
    expect(listed).toContain('Switch theme');
    const [, plain] = rowOf('Show or hide the sidebar').querySelectorAll(
      '[data-lit]',
    );
    expect(plain!.getAttribute('data-lit')).toBe('true');
  });

  it('finds a row by its name or by its keys', async () => {
    await mount(false, 'content');
    await key('?', { ctrlKey: true, shiftKey: true });
    await type('sidebar');
    expect(rows()).toContain('Show or hide the sidebar');
    expect(rows()).not.toContain('Settings, or back from them');
    await type('ctrl+shift+b');
    expect(rows()[0]).toBe('Show or hide the sidebar');
    await type('ctrl h');
    expect(rows()[0]).toBe('Go to the sidebar');
    expect(rows()).not.toContain('Show or hide the sidebar');
  });

  it('runs the Action chosen once closed, back where it was opened', async () => {
    await mount(false, 'content');
    await key('?', { ctrlKey: true, shiftKey: true });
    await type('ctrl+shift+b');
    await key('Enter');
    await flush();
    expect(search()).toBeNull();
    expect(toggled).toEqual(['content']);
    expect(active).toBe('content');
  });
});
