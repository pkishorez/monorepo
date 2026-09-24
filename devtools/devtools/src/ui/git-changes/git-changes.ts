import { useEffect, useRef, useState } from 'react';
import { Effect } from 'effect';
import type { FileDiff } from 'laymos';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'kui-toolkit/components/ui/sonner';

import {
  DevtoolsClient,
  useDevtoolsRuntime,
} from '../../client/devtools-rpc/index.js';

const uncommittedBaseRef = 'HEAD';

export interface GitChangesOptions {
  // Changing it refetches the Change set.
  readonly reloadNonce?: number;
  // A host that shares one Base ref across views controls it; otherwise it
  // starts at uncommitted changes and resets whenever the folder changes.
  readonly baseRef?: string;
  readonly onBaseRefChange?: (baseRef: string) => void;
  // Also list every path git knows, for owners that roll changes up.
  readonly knownFiles?: boolean;
}

/**
 * The browser half of git for one folder: its Base ref, the Change set and
 * branches measured there, and diffs of single files. Undefined data means
 * git is unavailable, which is reported once as a warning.
 */
export function useGitChanges(folder: string, options: GitChangesOptions = {}) {
  const runtime = useDevtoolsRuntime();
  const [ownBaseRef, setOwnBaseRef] = useState(uncommittedBaseRef);
  // A Base ref chosen on one Worktree rarely means the same on another.
  useEffect(() => setOwnBaseRef(uncommittedBaseRef), [folder]);
  const baseRef = options.baseRef ?? ownBaseRef;
  const setBaseRef = options.onBaseRefChange ?? setOwnBaseRef;

  const changesQuery = useQuery({
    queryKey: ['devtools-git', 'changes', folder, baseRef],
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetChanges({ folder, baseRef });
        }),
      ),
  });
  const branchesQuery = useQuery({
    queryKey: ['devtools-git', 'branches', folder],
    retry: false,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetBranches({ folder });
        }),
      ),
  });
  const knownFilesQuery = useQuery({
    queryKey: ['devtools-git', 'known-files', folder],
    retry: false,
    enabled: options.knownFiles === true,
    queryFn: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* DevtoolsClient;
          return yield* client.GetKnownFiles({ folder });
        }),
      ),
  });

  const reloadNonce = options.reloadNonce ?? 0;
  const seenReloadNonce = useRef(reloadNonce);
  useEffect(() => {
    if (seenReloadNonce.current === reloadNonce) return;
    seenReloadNonce.current = reloadNonce;
    void changesQuery.refetch();
    if (options.knownFiles === true) void knownFilesQuery.refetch();
  }, [reloadNonce]);

  useEffect(() => {
    if (!changesQuery.error) return;
    toast.warning('Git changes are unavailable', {
      description: messageOf(changesQuery.error),
    });
  }, [changesQuery.error]);

  const loadFileDiff = (path: string): Effect.Effect<FileDiff, unknown> =>
    Effect.flatMap(runtime.contextEffect, (context) =>
      Effect.gen(function* () {
        const client = yield* DevtoolsClient;
        return yield* client.GetFileDiff({ folder, path, baseRef });
      }).pipe(Effect.provide(context)),
    );

  return {
    baseRef,
    setBaseRef,
    changes: changesQuery.error ? undefined : changesQuery.data,
    branches: branchesQuery.error ? undefined : branchesQuery.data,
    knownFiles: knownFilesQuery.error ? undefined : knownFilesQuery.data,
    loadFileDiff,
  };
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('message' in error) return String(error.message);
    if ('reason' in error) return `Git: ${String(error.reason)}`;
  }
  return String(error);
}
