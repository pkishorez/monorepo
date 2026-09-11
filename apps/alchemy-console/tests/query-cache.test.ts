import { Effect } from 'effect';
import { QueryObserver } from '@tanstack/react-query';
import { effectQueryOptions } from 'use-effect-ts/query';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { makeQueryClient } from '../src/client/session/rpc-session/query-cache.ts';
import { rpcQueryKeys } from '../src/client/features/console/queries/index.ts';

const clients: ReturnType<typeof makeQueryClient>[] = [];
const makeClient = () => {
  const client = makeQueryClient();
  clients.push(client);
  return client;
};
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

it('shows cached entries immediately while refreshing a revisited screen', async () => {
  const client = makeClient();
  const key = rpcQueryKeys.stacks('personal');
  const cached = { storeName: 'Personal', data: ['console'] };
  client.setQueryData(key, cached);
  const response = Promise.withResolvers<typeof cached>();
  const observer = new QueryObserver(
    client,
    effectQueryOptions(
      key,
      Effect.promise(() => response.promise),
    ),
  );
  const unsubscribe = observer.subscribe(() => {});
  expect(observer.getCurrentResult()).toMatchObject({
    data: cached,
    isFetching: true,
    isPending: false,
  });
  response.resolve({ ...cached, data: ['console', 'docs'] });
  await vi.waitFor(() =>
    expect(observer.getCurrentResult()).toMatchObject({
      data: { data: ['console', 'docs'] },
      isFetching: false,
    }),
  );
  unsubscribe();
});

it('shares results and in-flight requests between a child count and its screen', async () => {
  const client = makeClient();
  const key = rpcQueryKeys.stages('personal', 'console');
  const response = Promise.withResolvers<string[]>();
  const request = vi.fn(() => response.promise);
  const options = effectQueryOptions(key, Effect.promise(request));
  const count = client.fetchQuery(options);
  const screen = client.fetchQuery(options);
  response.resolve(['dev', 'prod']);
  expect(await count).toEqual(await screen);
  expect(request).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(key)).toEqual(['dev', 'prod']);
  expect(
    client.getQueryData(rpcQueryKeys.stages('team', 'console')),
  ).toBeUndefined();
  expect(
    client.getQueryData(rpcQueryKeys.stageView('personal', 'console', 'dev')),
  ).toBeUndefined();
});

it('retains cached data when a background refresh fails', async () => {
  const client = makeClient();
  client.setQueryData(rpcQueryKeys.stores, ['personal']);
  const failure = { _tag: 'StoreDetailsError', code: 'timeout' };
  await expect(
    client.fetchQuery(
      effectQueryOptions(rpcQueryKeys.stores, Effect.fail(failure)),
    ),
  ).rejects.toEqual(failure);
  expect(client.getQueryData(rpcQueryKeys.stores)).toEqual(['personal']);
});

it('passes freshness, selection, and callback-enabled options through', () => {
  const client = makeClient();
  const key = ['query-options'] as const;
  client.setQueryData(key, ['cached']);
  const request = vi.fn(() => ['refetched']);
  const enabled = vi.fn(() => true);
  const observer = new QueryObserver(
    client,
    effectQueryOptions(key, Effect.sync(request), {
      staleTime: Infinity,
      enabled,
      select: (rows) => rows.length,
    }),
  );
  const unsubscribe = observer.subscribe(() => {});
  expect(observer.getCurrentResult()).toMatchObject({
    data: 1,
    isFetching: false,
  });
  expect(enabled).toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  unsubscribe();
});

it('interrupts Effect work when its last query observer leaves', async () => {
  const client = makeClient();
  const started = Promise.withResolvers<void>();
  const interrupted = vi.fn();
  const query = Effect.sync(() => started.resolve()).pipe(
    Effect.andThen(Effect.never),
    Effect.ensuring(Effect.sync(interrupted)),
  );
  const observer = new QueryObserver(
    client,
    effectQueryOptions(rpcQueryKeys.stores, query),
  );
  const unsubscribe = observer.subscribe(() => {});
  await started.promise;
  unsubscribe();
  await vi.waitFor(() => expect(interrupted).toHaveBeenCalledTimes(1));
});

it('invalidates child counts with their parent and isolates session caches', async () => {
  const client = makeClient();
  const key = rpcQueryKeys.stages('personal', 'console');
  client.setQueryData(key, ['dev']);
  await client.invalidateQueries({ queryKey: rpcQueryKeys.stacks('personal') });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(makeClient().getQueryData(key)).toBeUndefined();
  client.clear();
  expect(client.getQueryData(key)).toBeUndefined();
});
