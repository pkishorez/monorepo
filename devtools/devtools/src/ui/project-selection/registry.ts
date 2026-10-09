import { Effect } from 'effect';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../client/devtools-rpc/index.js';
import type { ProjectEntry, WorktreeResolution } from '../../rpc/index.js';

type Client = Effect.Success<typeof DevtoolsClient>;

function call<A, E>(
  runtime: DevtoolsRuntime,
  use: (client: Client) => Effect.Effect<A, E>,
) {
  return runtime.runPromise(Effect.flatMap(DevtoolsClient, use));
}

export const registryKey = ['devtools-project-registry'] as const;
export const worktreesKey = (path: string) =>
  ['devtools-worktrees', path] as const;

/** Every Monorepo and Single Package added to Monoverse, each with its Worktrees. */
export function useProjectRegistry() {
  const runtime = useDevtoolsRuntime();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: registryKey,
    retry: false,
    queryFn: () => call(runtime, (client) => client.ListProjects()),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: registryKey });

  const add = useMutation({
    mutationFn: (input: { path: string; label: string | null }) =>
      call(runtime, (client) => client.AddProject(input)),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (input: { id: string; path: string; label: string | null }) =>
      call(runtime, (client) => client.UpdateProject(input)),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      call(runtime, (client) => client.RemoveProject({ id })),
    onSuccess: invalidate,
  });

  return { query, add, update, remove };
}

/** The Worktrees of the repository `path` lives in; null outside git. */
export function useWorktrees(path: string | null) {
  const runtime = useDevtoolsRuntime();
  return useQuery({
    queryKey: worktreesKey(path ?? ''),
    enabled: path !== null,
    retry: false,
    queryFn: () =>
      call(runtime, (client) => client.ResolveWorktrees({ path: path! })),
  });
}

/** Finds the registry entry one path belongs to, by identity or as a Worktree sibling. */
export function findEntryForPath(
  entries: readonly ProjectEntry[] | undefined,
  path: string | null,
): ProjectEntry | null {
  if (!entries || path === null) return null;
  return (
    entries.find((entry) => entry.path === path) ??
    entries.find((entry) =>
      entry.worktrees?.worktrees.some((w) => w.siblingPath === path),
    ) ??
    null
  );
}

export function currentWorktree(
  resolution: WorktreeResolution | null | undefined,
) {
  if (!resolution || resolution.current === null) return null;
  return (
    resolution.worktrees.find((w) => w.root === resolution.current) ?? null
  );
}

export function basename(path: string) {
  return path.split('/').filter(Boolean).pop() ?? path;
}

type ReloadState = {
  nonce: number;
  bump: () => void;
};

// In-memory only: the header and the body are separate components, and a
// reload request has to reach both. Nothing here survives a page load.
const useReloadStore = create<ReloadState>((set) => ({
  nonce: 0,
  bump: () => set((state) => ({ nonce: state.nonce + 1 })),
}));

/** The reload signal; requesting it also refreshes the registry and Worktrees. */
export function useReload() {
  const queryClient = useQueryClient();
  const nonce = useReloadStore((state) => state.nonce);
  const bump = useReloadStore((state) => state.bump);
  const request = () => {
    bump();
    void queryClient.invalidateQueries({ queryKey: registryKey });
    void queryClient.invalidateQueries({ queryKey: ['devtools-worktrees'] });
  };
  return { nonce, request };
}
