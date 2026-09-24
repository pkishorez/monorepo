// @vitest-environment jsdom

import { act, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Context, Effect } from 'effect';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type {
  LoadMonorepoAnalysis,
  MonorepoAnalysis,
  MonoverseProps,
} from 'kui-toolkit/components/blocks/monoverse';
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
      dependencies: [],
    },
    {
      name: 'bare',
      path: 'packages/bare',
      group: 'packages',
      private: false,
      hasLaymos: false,
      dependencies: [],
    },
  ],
  violations: [],
};

const markdownFiles: Record<string, string> = {
  'packages/core/README.md':
    '# Core\n\nSee the [eschema notes](src/eschema/README.md).',
  'packages/core/src/eschema/README.md': '# eschema\n\nNested notes.',
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
    GetPackageReadme: (input: {
      monorepoRoot: string;
      packagePath: string;
      relativePath?: string;
    }) => Effect.Effect<
      { path: string; markdown: string },
      { _tag: string; message?: string }
    >;
    GetPackageFiles: (input: {
      monorepoRoot: string;
      packagePath: string;
    }) => Effect.Effect<{
      files: { path: string; content: string; binary?: boolean }[];
    }>;
  }>('test/DevtoolsClient');
  const context = Context.make(DevtoolsClient, {
    AnalyzeMonorepo: () => {
      state.calls++;
      return state.available
        ? Effect.succeed(analysis)
        : Effect.fail({ _tag: 'NotPnpmWorkspaceError' });
    },
    GetPackageReadme: ({ packagePath, relativePath = 'README.md' }) => {
      const markdown = markdownFiles[`${packagePath}/${relativePath}`];
      return markdown === undefined
        ? Effect.fail({ _tag: 'PackageReadmeNotFoundError' })
        : Effect.succeed({ path: relativePath, markdown });
    },
    GetPackageFiles: ({ packagePath }) =>
      Effect.succeed({
        files: [
          {
            path: `${packagePath}/src/index.ts`,
            content: 'export const core = 1;\n',
          },
          { path: `${packagePath}/logo.png`, content: '', binary: true },
        ],
      }),
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
    knownFiles: [
      'packages/core/src/index.ts',
      'packages/core/logo.png',
      'packages/bare/package.json',
    ],
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
vi.mock('kui-toolkit/components/blocks/monoverse', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('kui-toolkit/components/blocks/monoverse')
    >();
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

function dialogs() {
  return document.querySelectorAll('[data-slot="dialog-content"]');
}

async function rightClick(packageName: string) {
  await waitFor(
    () => document.querySelector(`[data-id="${packageName}"]`) !== null,
  );
  await act(async () => {
    document
      .querySelector(`[data-id="${packageName}"]`)!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
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

test('right-click opens the Package README and relative links stack dialogs', async () => {
  state.realBlock = true;
  state.available = true;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  await rightClick('core');
  expect(router.get()).toMatchObject({
    package: 'core',
    readme: ['README.md'],
  });
  await waitFor(
    () => document.body.textContent?.includes('eschema notes') ?? false,
  );
  expect(dialogs()).toHaveLength(1);
  expect(
    document.querySelector('[data-slot="dialog-content"] h1')?.textContent,
  ).toBe('Core');
  expect(tab('documentation')?.getAttribute('aria-selected')).toBe('true');

  await act(async () => {
    document
      .querySelector<HTMLAnchorElement>('a[href="src/eschema/README.md"]')!
      .click();
  });
  expect(router.get()).toMatchObject({
    readme: ['README.md', 'src/eschema/README.md'],
  });
  await waitFor(
    () => document.body.textContent?.includes('Nested notes') ?? false,
  );
  expect(dialogs()).toHaveLength(2);

  const closeButtons = document.querySelectorAll<HTMLButtonElement>(
    '[data-slot="dialog-close"]',
  );
  await act(async () => {
    closeButtons[closeButtons.length - 1]!.click();
  });
  expect(router.get()).toMatchObject({ readme: ['README.md'] });
  await waitFor(() => dialogs().length === 1);
  expect(document.body.textContent).toContain('eschema notes');
  expect(document.body.textContent).not.toContain('Nested notes');
});

test('a Package without README opens on its files', async () => {
  state.realBlock = true;
  state.available = true;
  state.changes = undefined;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  await rightClick('bare');
  await waitFor(() => tab('files')?.getAttribute('aria-selected') === 'true');
  expect(dialogs()).toHaveLength(1);
  expect(tab('documentation')?.hasAttribute('data-disabled')).toBe(true);
});

test('changed Packages are marked and their changed files open first', async () => {
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

  await waitFor(
    () =>
      document.querySelector('[data-id="core"] [title="Modified"]') !== null,
  );
  expect(document.querySelector('[data-id="bare"] [title="Modified"]')).toBe(
    null,
  );

  await rightClick('core');
  await act(async () => tab('files')!.click());
  await waitFor(() => document.body.textContent?.includes('logo.png') ?? false);
  expect(document.body.textContent).toContain('Loading diff…');
  state.changes = undefined;
});

test('Open in Laymos hides the dialog and closing Laymos restores it as left', async () => {
  state.realBlock = true;
  state.available = true;
  state.changes = undefined;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  await rightClick('core');
  await waitFor(() => tab('files') !== undefined);
  await act(async () => tab('files')!.click());
  await waitFor(() => tab('files')?.getAttribute('aria-selected') === 'true');

  await act(async () => button('Open in Laymos')!.click());
  expect(router.get()).toMatchObject({
    laymos: 'core',
    readme: ['README.md'],
  });
  await waitFor(() => dialogs().length === 0);

  await act(async () => router.set({ ...router.get(), laymos: undefined }));
  await waitFor(() => dialogs().length === 1);
  expect(tab('files')?.getAttribute('aria-selected')).toBe('true');
});

test('Open in Laymos is not offered without a Laymos badge', async () => {
  state.realBlock = true;
  state.available = true;
  router.set({ monorepo: '/repo' });
  await act(async () => root.render(<Monoverse />));

  await rightClick('bare');
  await waitFor(() => tab('files') !== undefined);
  expect(button('Open in Laymos')).toBeUndefined();
});

function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === label,
  );
}

function tab(name: 'documentation' | 'files') {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (element) => element.textContent?.toLowerCase() === name,
  );
}
