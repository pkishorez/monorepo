// @vitest-environment jsdom
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { toReact, View } from '@kestack/kabuki/react';
import { Navigation } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Machines, nobody } from '../../../../layer/capabilities/index.ts';
import { keys } from '../../../../keys.ts';
import { project } from '../../../routes/index.ts';
import { ProjectPickerLive } from './actor.ts';
import { ProjectPickerButton, ProjectPickerView } from './view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Project Picker as the shell keeps it: its View beside the page,
 * whatever the sidebar shows, and its plus in the sidebar only while the
 * sidebar shows the Projects, as the Settled List hides them. `o` works
 * either way. Choosing a Project goes on to the page, focus in it,
 * wherever the Picker was opened from; closing it without one
 * goes back there. The server is never reached: the recent Projects are
 * handed to it, and moving the app is only heard.
 */

const RECENT = [
  { machineId: 'm1', id: 'p1', name: 'monorepo', path: '/home/me/monorepo' },
  { machineId: 'm1', id: 'p2', name: 'notes', path: '/home/me/notes' },
];

const Owner = Actor.define('Owner', {
  model: Schema.Struct({ pings: Schema.Finite }),
  message: Schema.TaggedUnion({ Ping: {} }),
});

const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { pings: 0 } }),
  children: {
    projectPicker: {
      actor: ProjectPickerLive,
    },
  },
  on: {
    Ping: (_, { model }) => ({ model: { pings: model.pings + 1 } }),
  },
});

let pushed: Array<unknown> = [];
let pings = 0;
let ping = () => {};
let active = '';
let read = () => {};
let showProjects: (shown: boolean) => void = () => {};

/** Hands the Picker its recent Projects, as its Worker would. */
const Recent = View.make(ProjectPickerLive, ({ send }) => {
  read = () => send({ _tag: 'Read', recent: RECENT });
  return null;
});

function Sidebar({ plus }: { readonly plus: ReactNode }) {
  const [projects, setProjects] = useState(true);
  showProjects = setProjects;
  const spot = keys.useFocusSpot('sidebar', 'row', { default: true });
  return (
    <keys.Surface id="sidebar">
      <button type="button" ref={spot}>
        A row
      </button>
      {projects && plus}
    </keys.Surface>
  );
}

function Page() {
  active = keys.useKeyboard().active;
  const spot = keys.useFocusSpot('content', 'page', { default: true });
  return (
    <keys.Surface id="content">
      <div ref={spot} tabIndex={0} data-testid="editor" />
    </keys.Surface>
  );
}

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  pings = model.pings;
  ping = () => send({ _tag: 'Ping' });
  return (
    <keys.Provider vim>
      <Recent instance={children.projectPicker} />
      <Sidebar
        plus={<ProjectPickerButton instance={children.projectPicker} />}
      />
      <Page />
      <ProjectPickerView instance={children.projectPicker} />
    </keys.Provider>
  );
});

const services = Layer.mergeAll(
  Layer.mock(CodeClients)({}),
  // One Machine: the Picker opens at its Projects.
  Layer.mock(Machines)({
    state: Stream.make({
      ...nobody,
      accountId: 'a1',
      machines: [
        {
          id: 'm1',
          name: 'studio',
          key: 'key-m1',
          version: '0.0.1',
          status: { _tag: 'Opening' },
          lastSeen: 1,
        },
      ],
    }),
  }),
  // Recent Projects are handed over by `read`, never held from a Replica.
  Layer.mock(Replicas)({ hold: () => Effect.never }),
  Layer.mock(Navigation)({
    push: (to) => Effect.sync(() => void pushed.push(to)),
  }),
);

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const editor = () =>
  document.querySelector<HTMLElement>('[data-testid="editor"]')!;
const row = () =>
  [...document.querySelectorAll<HTMLElement>('button')].find(
    (each) => each.textContent === 'A row',
  )!;
const plus = () =>
  document.querySelector<HTMLElement>('button[aria-label="Open a project"]');
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');

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
      new KeyboardEvent('keyup', { key: name, bubbles: true, ...init }),
    );
  });
  await flush();
};

/** Opens the Picker from the sidebar, by keys or by its plus, and hands it the Projects. */
const openFromSidebar = async (how: 'keys' | 'mouse') => {
  await act(async () => {
    row().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    row().focus();
  });
  await flush();
  expect(active).toBe('sidebar');
  if (how === 'keys') await key('o');
  else {
    await act(async () => plus()!.click());
    await flush();
  }
  await act(async () => read());
  await flush();
  expect(document.activeElement).toBe(search());
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(async () => {
  pushed = [];
  const App = toReact(OwnerLive, OwnerView, services, {
    name: `project-picker-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  expect(pings).toBeGreaterThan(0);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('the Project Picker', () => {
  it('opens on `o` while the sidebar shows no plus, as with the Settled List open', async () => {
    await act(async () => showProjects(false));
    await flush();
    expect(plus()).toBeNull();
    await act(async () => editor().focus());
    await key('o');
    expect(search()).not.toBeNull();
    expect(document.activeElement).toBe(search());
  });

  it.each(['keys', 'mouse'] as const)(
    'opened from the sidebar by %s, goes on to the page as a Project is chosen',
    async (how) => {
      await openFromSidebar(how);
      await key('Enter');
      await flush();
      expect(search()).toBeNull();
      expect(pushed).toEqual([project('m1', 'p1')]);
      expect(active).toBe('content');
      expect(document.activeElement).toBe(editor());
    },
  );

  it('goes back to the sidebar when closed without a choice', async () => {
    await openFromSidebar('keys');
    await key('Escape');
    expect(search()).toBeNull();
    expect(pushed).toEqual([]);
    expect(active).toBe('sidebar');
    expect(document.activeElement).toBe(row());
  });
});
