// @vitest-environment jsdom

import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Context, Effect } from 'effect';
import { expect, test, vi } from 'vitest';
import type { LoadMonorepoAnalysis } from 'kui-toolkit/components/blocks/monoverse';
import { Monoverse } from './monoverse.js';

const state = vi.hoisted(() => ({ nonce: 0, available: false, calls: 0 }));

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ monorepo: '/repo' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../../../client/devtools-rpc/index.js', () => {
  const DevtoolsClient = Context.Service<{
    AnalyzeMonorepo: () => Effect.Effect<unknown, { _tag: string }>;
  }>('test/DevtoolsClient');
  const context = Context.make(DevtoolsClient, {
    AnalyzeMonorepo: () => {
      state.calls++;
      return state.available
        ? Effect.succeed({ packages: [] })
        : Effect.fail({ _tag: 'NotPnpmWorkspaceError' });
    },
  });
  return {
    DevtoolsClient,
    useDevtoolsRuntime: () => ({ contextEffect: Effect.succeed(context) }),
  };
});
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
vi.mock('kui-toolkit/components/blocks/monoverse', () => ({
  Monoverse: ({
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
  },
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('reload recovers after a missing workspace is restored', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
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
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
