import { Effect } from 'effect';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
  type DevtoolsRuntime,
} from '../../client/devtools-rpc/index.js';
import type {
  ProjectEntry,
  RegistryTool,
  WorktreeResolution,
} from '../../rpc/index.js';

type Client = Effect.Success<typeof DevtoolsClient>;

function call<A, E>(
  runtime: DevtoolsRuntime,
  use: (client: Client) => Effect.Effect<A, E>,
) {
  return runtime.runPromise(Effect.flatMap(DevtoolsClient, use));
}

export const registryKey = (tool: RegistryTool) =>
  ['devtools-project-registry', tool] as const;
export const worktreesKey = (path: string) =>
  ['devtools-worktrees', path] as const;

/** The registered Projects of one Tool, each with its Worktrees. */
export function useProjectRegistry(tool: RegistryTool) {
  const runtime = useDevtoolsRuntime();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: registryKey(tool),
    retry: false,
    queryFn: () => call(runtime, (client) => client.ListProjects({ tool })),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: registryKey(tool) });

  const add = useMutation({
    mutationFn: (input: { path: string; label: string | null }) =>
      call(runtime, (client) => client.AddProject({ tool, ...input })),
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
  nonce: Record<RegistryTool, number>;
  bump: (tool: RegistryTool) => void;
};

// In-memory only: the header and the body are separate components, and a
// reload request has to reach both. Nothing here survives a page load.
const useReloadStore = create<ReloadState>((set) => ({
  nonce: { monoverse: 0, laymos: 0 },
  bump: (tool) =>
    set((state) => ({
      nonce: { ...state.nonce, [tool]: state.nonce[tool] + 1 },
    })),
}));

/** One reload signal per Tool; requesting it also refreshes the registry and Worktrees. */
export function useReload(tool: RegistryTool) {
  const queryClient = useQueryClient();
  const nonce = useReloadStore((state) => state.nonce[tool]);
  const bump = useReloadStore((state) => state.bump);
  const request = () => {
    bump(tool);
    void queryClient.invalidateQueries({ queryKey: registryKey(tool) });
    void queryClient.invalidateQueries({ queryKey: ['devtools-worktrees'] });
  };
  return { nonce, request };
}
