// @vitest-environment jsdom

import { act, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Context, Effect } from 'effect';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type {
  LoadMonorepoAnalysis,
  MonorepoAnalysis,
  MonoverseProps,
} from '@devtools/ui/monoverse';
import { Monoverse } from './monoverse.js';

const state = vi.hoisted(() => ({
  nonce: 0,
  available: false,
  calls: 0,
  realBlock: false,
  changes: undefined as
    | undefined
    | {
        baseRef: string;
        files: {
          path: string;
          status: 'added' | 'modified';
          committed: boolean;
          uncommitted: boolean;
        }[];
      },
}));

// The route keeps every selection in the URL, so the router mock is a tiny
// store: navigate writes the search, useSearch subscribes to it.
const router = vi.hoisted(() => {
  let search: Record<string, unknown> = { monorepo: '/repo' };
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: Record<string, unknown>) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

const analysis: MonorepoAnalysis = {
  name: 'repo',
  path: '/repo',
  packages: [
    {
      name: 'core',
      path: 'packages/core',
      group: 'packages',
      private: false,
      hasLaymos: true,
      hasStories: true,
      dependencies: [],
    },
    {
      name: 'bare',
      path: 'packages/bare',
      group: 'packages',
      private: false,
      hasLaymos: false,
      hasStories: false,
      dependencies: [],
    },
  ],
  violations: [],
};

const monorepoFiles: Record<string, string> = {
  'README.md': '# The whole repo',
  'packages/core/README.md': '# Core\n\nWhat the core holds.',
  'packages/core/src/index.ts': 'export const core = 1;\n',
  'packages/bare/package.json': '{"name":"bare"}',
};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => useSyncExternalStore(router.subscribe, router.get),
  useNavigate:
    () =>
    ({ search }: { search: Record<string, unknown> }) =>
      router.set(search),
}));
vi.mock('../../../client/devtools-rpc/index.js', () => {
  const DevtoolsClient = Context.Service<{
    AnalyzeMonorepo: () => Effect.Effect<MonorepoAnalysis, { _tag: string }>;
    GetMonorepoFile: (input: {
      monorepoRoot: string;
      path: string;
    }) => Effect.Effect<
      { path: string; content: string },
      { _tag: string; path: string }
    >;
  }>('test/DevtoolsClient');
  const context = Context.make(DevtoolsClient, {
    AnalyzeMonorepo: () => {
      state.calls++;
      return state.available
        ? Effect.succeed(analysis)
        : Effect.fail({ _tag: 'NotPnpmWorkspaceError' });
    },
    GetMonorepoFile: ({ path }) => {
      const content = monorepoFiles[path];
      return content === undefined
        ? Effect.fail({ _tag: 'MonorepoFileNotFoundError', path })
        : Effect.succeed({ path, content });
    },
  });
  return {
    DevtoolsClient,
    useDevtoolsRuntime: () => ({ contextEffect: Effect.succeed(context) }),
  };
});
vi.mock('../../git-changes/index.js', () => ({
  useGitChanges: () => ({
    baseRef: 'HEAD',
    setBaseRef: () => {},
    changes: state.changes,
    branches: [],
    knownFiles: Object.keys(monorepoFiles),
    loadFileDiff: () => Effect.never,
  }),
}));
vi.mock('../../project-selection/index.js', () => ({
  useReload: () => ({ nonce: state.nonce }),
  useWorktrees: () => ({
    isPending: false,
    data: { current: '/repo', worktrees: [] },
  }),
  isMissingInWorktree: () => false,
  MissingProjectState: () => <div>Missing workspace</div>,
}));
vi.mock('../../laymos/project-workspace/index.js', () => ({
  LaymosProjectWorkspace: () => null,
}));
vi.mock('@devtools/ui/monoverse', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@devtools/ui/monoverse')>();
  const FakeMonoverse = ({
    loadAnalysis,
    reloadNonce,
  }: {
    loadAnalysis: LoadMonorepoAnalysis;
    reloadNonce: number;
  }) => {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      Effect.runSync(
        loadAnalysis().pipe(
          Effect.match({
            onSuccess: () => setLoaded(true),
            onFailure: () => setLoaded(false),
          }),
        ),
      );
    }, [reloadNonce]);
    return <div>{loaded ? 'Workspace loaded' : 'Loading'}</div>;
  };
  return {
    ...actual,
    Monoverse: (props: MonoverseProps) =>
      state.realBlock ? (
        <actual.Monoverse {...props} />
      ) : (
        <FakeMonoverse
          loadAnalysis={props.loadAnalysis}
          reloadNonce={props.reloadNonce ?? 0}
        />
      ),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, {
  ResizeObserver: ResizeObserverStub,
  DOMMatrixReadOnly: class {
    m22 = 1;
  },
});
// jsdom lays nothing out, so it cannot scroll.
Element.prototype.scrollIntoView = () => {};
Element.prototype.scrollTo = () => {};
Object.assign(globalThis, {
  CSS: { escape: (value: string) => value.replace(/["\\]/g, '\\$&') },
});
window.matchMedia = () =>
  ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error('Condition not met in time.');
}

function card(path: string) {
  return document.querySelector<HTMLElement>(
    `[role="button"][aria-label="${path}"]`,
  );
}

async function onCard(path: string, type: 'contextmenu' | 'dblclick') {
  await waitFor(() => card(path) !== null);
  await act(async () => {
    card(path)!.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  });
}

test('reload recovers after a missing workspace is restored', async () => {
  state.realBlock = false;
  state.available = false;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));
  expect(container.textContent).toBe('Missing workspace');
  expect(state.calls).toBe(1);
  // Retrying while it is still missing must remain recoverable too.
  state.nonce++;
  await act(async () => root.render(<Monoverse />));
  expect(container.textContent).toBe('Missing workspace');
  expect(state.calls).toBe(2);
  state.available = true;
  state.nonce++;
  await act(async () => root.render(<Monoverse />));
  expect(container.textContent).toBe('Workspace loaded');
  expect(state.calls).toBe(3);
});

test("right-click lists a Package's files, its README first", async () => {
  state.realBlock = true;
  state.available = true;
  state.changes = undefined;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  await onCard('packages/core', 'contextmenu');
  await waitFor(
    () => document.body.textContent?.includes('What the core holds.') ?? false,
  );
  expect(document.body.textContent).toContain('index.ts');
});

test('right-click on the empty canvas lists every file of the Monorepo', async () => {
  state.realBlock = true;
  state.available = true;
  state.changes = undefined;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  await waitFor(() => card('packages/core') !== null);
  const ground = document.querySelector<HTMLElement>(
    '[role="tree"][aria-label="Laymo of repo"]',
  )!;
  await act(async () => {
    ground.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  });
  await waitFor(
    () => document.body.textContent?.includes('The whole repo') ?? false,
  );
  expect(document.body.textContent).toContain('4 files');
});

test('double-click opens a Package in Laymos, or a Package without one on its files', async () => {
  state.realBlock = true;
  state.available = true;
  state.changes = undefined;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  await onCard('packages/bare', 'dblclick');
  expect(router.get().laymos).toBeUndefined();
  await waitFor(
    () => document.body.textContent?.includes('package.json') ?? false,
  );

  await onCard('packages/core', 'dblclick');
  expect(router.get()).toMatchObject({ laymos: 'core' });
});

test('a Package carries the Laymos badge, and the Stories badge when it has Stories', async () => {
  state.realBlock = true;
  state.available = true;
  state.changes = undefined;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  await waitFor(() => card('packages/core') !== null);
  const badges = (path: string) =>
    [...card(path)!.querySelectorAll('[role="img"]')].map((badge) =>
      badge.getAttribute('aria-label'),
    );
  expect(badges('packages/core')).toEqual([
    'Has a Laymos Config',
    'Has Stories',
  ]);
  expect(badges('packages/bare')).toEqual([]);
});

test('a changed Package is marked in the outline', async () => {
  state.realBlock = true;
  state.available = true;
  state.changes = {
    baseRef: 'HEAD',
    files: [
      {
        path: 'packages/core/src/index.ts',
        status: 'modified',
        committed: false,
        uncommitted: true,
      },
    ],
  };
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  const marked = () =>
    [...document.querySelectorAll('[role="treeitem"]')]
      .filter((row) => row.querySelector('[aria-label="modified"]') !== null)
      .map((row) => row.textContent);
  await waitFor(() => marked().length > 0);
  expect(marked()).toEqual(['packages', 'core']);
  state.changes = undefined;
});
