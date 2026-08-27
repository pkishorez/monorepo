import { Effect } from 'effect';
import { AlertCircle, Database, LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { StudioRpcClient } from 'std-toolkit/studio-rpc';
import type { TableEntitySnapshot, TableSnapshot } from 'std-toolkit/snapshot';
import { useComponentLifecycle } from 'use-effect-ts';

import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';

import {
  QueryModel,
  type QueryCriteria,
  type StudioQueryRecord,
  type StudioRecord,
} from '../query-model';
import { RecordDetails } from '../record-details';
import { RecordTable } from '../record-table';
import { QueryBuilder } from './query-builder';

type Page = {
  readonly items: readonly StudioRecord[];
  readonly hasMore: boolean;
};

type Request =
  | { readonly id: number; readonly kind: 'single'; readonly entity: string }
  | {
      readonly id: number;
      readonly kind: 'query';
      readonly criteria: QueryCriteria;
      readonly after?: StudioQueryRecord;
      readonly pageIndex: number;
    };

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type RequestInput = WithoutId<Request>;

type ResultState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly message: string }
  | { readonly kind: 'success' };

const failureMessage = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
    if ('_tag' in error && typeof error._tag === 'string') return error._tag;
  }
  return 'The query could not be completed.';
};

export function QueryWorkspace({
  snapshot,
  rpcClient,
}: {
  readonly snapshot: TableSnapshot;
  readonly rpcClient: StudioRpcClient<unknown>;
}) {
  const [selectedEntity, setSelectedEntity] = useState<TableEntitySnapshot>();
  const [criteria, setCriteria] = useState<QueryCriteria>();
  const [request, setRequest] = useState<Request>();
  const [requestId, setRequestId] = useState(0);
  const [resultState, setResultState] = useState<ResultState>({ kind: 'idle' });
  const [pages, setPages] = useState<readonly Page[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [stale, setStale] = useState(false);
  const [inspectedRecord, setInspectedRecord] = useState<StudioRecord>();

  useComponentLifecycle(
    request === undefined
      ? Effect.void
      : request.kind === 'single'
        ? rpcClient['Studio.GetEntity']({ entity: request.entity }).pipe(
            Effect.match({
              onFailure: (error) =>
                setResultState({
                  kind: 'failure',
                  message: failureMessage(error),
                }),
              onSuccess: (record) => {
                setPages([
                  {
                    items: record === null ? [] : [record],
                    hasMore: false,
                  },
                ]);
                setPageIndex(0);
                setResultState({ kind: 'success' });
              },
            }),
          )
        : (() => {
            const payload = QueryModel.payload(request.criteria, request.after);
            if (payload === undefined) return Effect.void;
            return rpcClient['Studio.QueryEntities'](payload).pipe(
              Effect.match({
                onFailure: (error) =>
                  setResultState({
                    kind: 'failure',
                    message: failureMessage(error),
                  }),
                onSuccess: (page) => {
                  setPages((current) => {
                    const next = current.slice(0, request.pageIndex);
                    next[request.pageIndex] = page;
                    return next;
                  });
                  setPageIndex(request.pageIndex);
                  setStale(false);
                  setResultState({ kind: 'success' });
                },
              }),
            );
          })(),
    { deps: [rpcClient, request?.id] },
  );

  const issue = (next: RequestInput) => {
    const id = requestId + 1;
    setRequestId(id);
    setResultState({ kind: 'loading' });
    setRequest({ ...next, id } as Request);
  };

  const selectEntity = (name: string) => {
    const entity = snapshot.entities.find(
      (candidate) => candidate.name === name,
    );
    setSelectedEntity(entity);
    setCriteria(undefined);
    setPages([]);
    setPageIndex(0);
    setStale(false);
    setInspectedRecord(undefined);
    setRequest(undefined);
    setResultState({ kind: 'idle' });
    if (entity?.kind === 'single') {
      issue({ kind: 'single', entity: entity.name });
      return;
    }
    const primary = entity?.accessPatterns.find(
      (pattern) => pattern.kind === 'primary',
    );
    if (entity !== undefined && primary !== undefined) {
      setCriteria(QueryModel.initialCriteria(entity, primary));
    }
  };

  const applySelection = (
    entity: TableEntitySnapshot,
    nextCriteria?: QueryCriteria,
  ) => {
    if (entity.kind === 'single') {
      selectEntity(entity.name);
      return;
    }
    if (nextCriteria === undefined) return;

    setSelectedEntity(entity);
    setCriteria(nextCriteria);
    setInspectedRecord(undefined);
    setPages([]);
    setPageIndex(0);
    setStale(false);
    issue({ kind: 'query', criteria: nextCriteria, pageIndex: 0 });
  };

  const run = () => {
    if (criteria === undefined || !QueryModel.canRun(criteria)) return;
    setPages([]);
    setPageIndex(0);
    issue({ kind: 'query', criteria, pageIndex: 0 });
  };

  const refresh = () => {
    if (selectedEntity?.kind === 'single') {
      issue({ kind: 'single', entity: selectedEntity.name });
      return;
    }
    run();
  };

  const currentPage = pages[pageIndex];
  const columns = useMemo(
    () =>
      selectedEntity === undefined
        ? []
        : QueryModel.valueFields(snapshot, selectedEntity),
    [selectedEntity, snapshot],
  );

  const retry = () => {
    if (request === undefined) return;
    const { id: _, ...sameRequest } = request;
    issue(sameRequest);
  };

  return (
    <div className="grid gap-4">
      <QueryBuilder
        entities={snapshot.entities}
        selectedEntity={selectedEntity}
        criteria={criteria}
        running={resultState.kind === 'loading'}
        stale={stale}
        onApply={applySelection}
        onRun={run}
        onRefresh={refresh}
      />

      {selectedEntity === undefined ? (
        <CenteredState
          icon={<Database />}
          title="Select an Entity"
          detail="Choose an Entity to inspect its records and available access patterns."
        />
      ) : resultState.kind === 'loading' ? (
        <CenteredState
          icon={<LoaderCircle className="animate-spin" />}
          title="Loading records"
          detail="Running the request through Studio RPC."
        />
      ) : resultState.kind === 'failure' ? (
        <CenteredState
          icon={<AlertCircle />}
          title="Query failed"
          detail={resultState.message}
          action={
            <Button type="button" variant="outline" onClick={retry}>
              Retry
            </Button>
          }
        />
      ) : resultState.kind === 'success' && currentPage !== undefined ? (
        <RecordTable
          records={currentPage.items}
          columns={columns}
          page={pageIndex + 1}
          pageSize={criteria?.limit ?? 1}
          paginated={selectedEntity.kind === 'keyed'}
          hasPrevious={pageIndex > 0}
          hasNext={currentPage.hasMore || pageIndex < pages.length - 1}
          onPrevious={() => setPageIndex((value) => Math.max(0, value - 1))}
          onNext={() => {
            if (pageIndex < pages.length - 1) {
              setPageIndex((value) => value + 1);
              return;
            }
            if (criteria === undefined || !currentPage.hasMore) return;
            const after = currentPage.items.at(-1);
            if (after === undefined || !QueryModel.isQueryRecord(after)) return;
            issue({
              kind: 'query',
              criteria,
              after,
              pageIndex: pageIndex + 1,
            });
          }}
          onPageSizeChange={(limit) => {
            if (criteria === undefined) return;
            const next = { ...criteria, limit };
            setCriteria(next);
            setPages([]);
            setPageIndex(0);
            issue({ kind: 'query', criteria: next, pageIndex: 0 });
          }}
          onRecordOpen={setInspectedRecord}
        />
      ) : (
        <CenteredState
          icon={<Database />}
          title="Ready to query"
          detail="Enter the required key values, then run the query."
        />
      )}

      <RecordDetails
        record={inspectedRecord}
        onOpenChange={(open) => {
          if (!open) setInspectedRecord(undefined);
        }}
      />
    </div>
  );
}

function CenteredState({
  icon,
  title,
  detail,
  action,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <Empty className="min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
      {action !== undefined && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
