import { Effect, Semaphore } from 'effect';
import { useEffect, useState } from 'react';
import { LoaderCircle } from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../queries/index.ts';
import { ExplorerTree } from './explorer-tree.tsx';
import { StoreOverview, StackOverview } from './overview-pane.tsx';

export function StateTree(
  props: Pick<
    Parameters<typeof ExplorerTree>[0],
    'storeId' | 'stack' | 'stage' | 'NavigationLink'
  >,
) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(props.stack ? [props.stack] : []),
  );
  const [slots] = useState(() => Semaphore.makeUnsafe(4));
  // Navigating into a stack reveals it without collapsing the ones already open.
  useEffect(() => {
    if (props.stack === undefined) return;
    const current = props.stack;
    setExpanded((previous) =>
      previous.has(current) ? previous : new Set([...previous, current]),
    );
  }, [props.stack, props.stage]);
  const stacks = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['Explorer.ListStacks']({ storeId: props.storeId }),
    ),
    rpcQueryKeys.stacks(props.storeId),
  );
  return (
    <ExplorerTree
      {...props}
      filter={filter}
      onFilterChange={setFilter}
      expanded={expanded}
      onExpandedChange={setExpanded}
      slots={slots}
      stacks={stacks}
    />
  );
}
export function StateOverview(
  props: Parameters<typeof StoreOverview>[0] & { stack?: string },
) {
  return props.stack === undefined ? (
    <StoreOverview {...props} />
  ) : (
    <StackOverview {...props} stack={props.stack} />
  );
}
export function StackCount({
  storeId,
  slots,
}: {
  storeId: string;
  slots: Semaphore.Semaphore;
}) {
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) => rpc['Explorer.ListStacks']({ storeId })).pipe(
      slots.withPermits(1),
    ),
    rpcQueryKeys.stacks(storeId),
  );
  return (
    <span className="flex min-w-16 shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground tabular-nums">
      {query.pending && (
        <LoaderCircle
          className="size-3 motion-safe:animate-spin"
          aria-label="Loading stack count"
        />
      )}
      {query.error ? (
        <span title={query.error}>Unavailable</span>
      ) : query.data ? (
        `${query.data.data.length} stack${query.data.data.length === 1 ? '' : 's'}`
      ) : null}
    </span>
  );
}
