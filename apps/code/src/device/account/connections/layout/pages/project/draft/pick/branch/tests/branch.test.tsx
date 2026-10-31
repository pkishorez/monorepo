// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Schema } from 'effect';
import { Branches } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../../../../commands.ts';
import * as Picker from '../../../../../../../../../../ui/controls/picker/index.ts';
import { BranchPicker, BranchSettings, type Git, rowsOf } from '../branch.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Branch Picker on a page that keeps the branch picked, as a new
 * session's Draft does: one list in two sections, Local, then Origin, as
 * Connect lists them, a local branch that tracks one on Origin saying so;
 * one checked out in a linked Worktree says where. Until a
 * branch is picked, the one the Project's folder is on is checked. Its
 * Branch row and the New Worktree switch show only once the branches are
 * read, and never for a Project that is not a git repository, which says
 * so in a line instead.
 */

const GIT: Git = {
  _tag: 'Git',
  current: 'main',
  worktrees: [
    { path: '/code/app', branch: 'main' },
    { path: '/data/worktrees/p1/01x', branch: 'fix' },
  ],
  local: [
    { name: 'main', upstream: 'origin/main', worktree: '/code/app' },
    { name: 'fix', upstream: null, worktree: '/data/worktrees/p1/01x' },
    { name: 'spike', upstream: null, worktree: null },
  ],
  // Connect lists no Origin branch a local one tracks: `origin/main` is not.
  origin: ['origin/release', 'origin/spike'],
};

describe('the branches as rows', () => {
  it('lists Local, then every Origin branch Connect gives, the one in effect checked', () => {
    expect(rowsOf(GIT, null)).toEqual([
      {
        value: 'main',
        label: 'main',
        group: 'Local',
        checked: true,
        detail: 'tracks origin/main',
      },
      {
        value: 'fix',
        label: 'fix',
        group: 'Local',
        checked: false,
        detail: 'checked out in /data/worktrees/p1/01x',
      },
      { value: 'spike', label: 'spike', group: 'Local', checked: false },
      {
        value: 'origin/release',
        label: 'origin/release',
        group: 'Origin',
        checked: false,
      },
      // A local `spike` that does not track it: listed all the same.
      {
        value: 'origin/spike',
        label: 'origin/spike',
        group: 'Origin',
        checked: false,
      },
    ]);
  });

  it('checks the branch picked over the one the folder is on', () => {
    expect(
      rowsOf(GIT, 'origin/release')
        .filter(({ checked }) => checked)
        .map(({ value }) => value),
    ).toEqual(['origin/release']);
  });
});

/** The branches the page is drawn with. */
let shown: Branches | null = GIT;

const Page = Actor.define('Page', {
  model: Schema.Struct({
    picked: Schema.NullOr(Schema.String),
    newWorktree: Schema.Boolean,
    how: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
  }),
  message: Schema.TaggedUnion({
    Open: { how: Picker.How },
    Toggle: {},
    Done: { branch: Schema.NullOr(Schema.String) },
  }),
});

const PageLive = Page.build({
  init: () => ({
    model: { picked: null, newWorktree: false, how: null, opened: 0 },
  }),
  children: {
    branches: Actor.child(BranchPicker.Live, {
      while: ({ model }) => model.how !== null && shown?._tag === 'Git',
      key: ({ model }) => String(model.opened),
      input: ({ model }) => BranchPicker.opening(model.how ?? 'keys'),
      props: ({ model }) => ({
        branches: shown ?? { _tag: 'NotGit' as const },
        picked: model.picked,
      }),
    }),
  },
  provides: (self) =>
    BranchPicker.owner((branch) => self.send({ _tag: 'Done', branch })),
  on: {
    Open: ({ how }, { model }) => ({
      model: { ...model, how, opened: model.opened + 1 },
    }),
    Toggle: (_, { model }) => ({
      model: { ...model, newWorktree: !model.newWorktree },
    }),
    Done: ({ branch }, { model }) => ({
      model: { ...model, how: null, picked: branch ?? model.picked },
    }),
  },
});

let page = { picked: null as string | null, newWorktree: false };

const PageView = View.make(PageLive, ({ model, children, send }) => {
  page = { picked: model.picked, newWorktree: model.newWorktree };
  return (
    <keys.Provider vim>
      <Editor />
      <BranchSettings
        branches={shown}
        picked={model.picked}
        newWorktree={model.newWorktree}
        how={model.how}
        onOpen={(how) => send({ _tag: 'Open', how })}
        onToggle={() => send({ _tag: 'Toggle' })}
      >
        {children.branches && (
          <BranchPicker.View instance={children.branches} />
        )}
      </BranchSettings>
    </keys.Provider>
  );
});

function Editor() {
  const spot = keys.useFocusSpot('content', 'page', { default: true });
  return (
    <keys.Surface id="content">
      <div ref={spot} tabIndex={0} data-testid="editor" />
    </keys.Surface>
  );
}

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const editor = () =>
  document.querySelector<HTMLElement>('[data-testid="editor"]')!;
const trigger = () =>
  document.querySelector<HTMLElement>('button[aria-label^="Branch"]');
const toggle = () => document.querySelector<HTMLElement>('[role="switch"]');
const items = () => [...document.querySelectorAll<HTMLElement>('[cmdk-item]')];
const rows = () =>
  items().map((item) => ({
    text: item.textContent,
    checked: item.dataset['checked'] === 'true',
  }));
const headings = () =>
  [...document.querySelectorAll<HTMLElement>('[cmdk-group-heading]')].map(
    (heading) => heading.textContent,
  );

const draw = async () => {
  const App = View.app(PageView, { name: `branch-picker-test-${apps++}` });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  await flush();
  await act(async () => editor().focus());
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  document.documentElement.toggleAttribute('data-keyboard', true);
  shown = GIT;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('BranchPicker', () => {
  it('says so for a Project that is not a git repository, with no controls', async () => {
    shown = { _tag: 'NotGit' };
    await draw();
    expect(trigger()).toBeNull();
    expect(toggle()).toBeNull();
    expect(document.body.textContent).toContain('Not a git repository');
  });

  it('shows nothing while the branches are read', async () => {
    shown = null;
    await draw();
    expect(trigger()).toBeNull();
    expect(toggle()).toBeNull();
  });

  it('starts on the branch the folder is on, the New Worktree toggle off', async () => {
    await draw();
    expect(trigger()?.getAttribute('aria-label')).toBe('Branch: main');
    expect(trigger()?.textContent).toContain('tracks origin/main');
    expect(toggle()?.getAttribute('aria-checked')).toBe('false');
    expect(document.body.textContent).toContain('Works in this folder on main');
    await act(async () => toggle()!.click());
    await flush();
    expect(page.newWorktree).toBe(true);
    expect(toggle()?.getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain(
      'Makes a new worktree and branch from main',
    );
  });

  it('opens on `shift+b` as one list in two sections, and picks the branch chosen', async () => {
    await draw();
    await act(async () => {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'B',
          code: 'KeyB',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await flush();
    expect(headings()).toEqual(['Local', 'Origin']);
    expect(rows()).toEqual([
      { text: expect.stringContaining('main'), checked: true },
      { text: expect.stringContaining('fix'), checked: false },
      { text: expect.stringContaining('spike'), checked: false },
      { text: expect.stringContaining('origin/release'), checked: false },
      { text: expect.stringContaining('origin/spike'), checked: false },
    ]);
    await act(async () => items()[3]!.click());
    await flush();
    expect(page.picked).toBe('origin/release');
    expect(trigger()?.getAttribute('aria-label')).toBe(
      'Branch: origin/release',
    );
  });
  it('hints no Mod+Enter to finish, picking being finishing in its one Step', async () => {
    await draw();
    await act(async () => trigger()!.click());
    await flush();
    const footer = document.querySelector('[cmdk-root] > p[aria-hidden]');
    expect(footer?.textContent).toContain('pick');
    expect(footer?.textContent).not.toContain('done');
  });
});
