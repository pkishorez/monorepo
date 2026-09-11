import { Context, Effect, Exit, Layer } from 'effect';
import { expect, it, vi } from 'vite-plus/test';
import { FetchHttpClient } from 'effect/unstable/http';
import { InMemoryService } from 'alchemy/State/InMemoryState';
import { State, type ResourceState } from 'alchemy/State';
import type { ProviderService } from 'alchemy/Provider';
class TestProvider extends Context.Service<TestProvider, ProviderService>()(
  'Cloudflare.Test',
) {}
import { Stack } from 'alchemy/Stack';
import { Stage } from 'alchemy/Stage';
import { Cli } from 'alchemy/Cli/Cli';
import { apply } from 'alchemy/Apply';
import { prepare } from '../src/server/services/stage-destruction/deletion-review/index.ts';

const row = (id: string, options: Partial<ResourceState> = {}): ResourceState =>
  ({
    status: 'created',
    resourceType: 'Cloudflare.Test',
    namespace: undefined,
    fqn: id,
    logicalId: id,
    instanceId: `instance-${id}`,
    providerVersion: 1,
    downstream: [],
    bindings: [],
    props: {},
    attr: { id },
    ...options,
  }) as ResourceState;
const input = {
  stack: 'App',
  stage: 'dev',
  connection: { accountId: 'a'.repeat(32), apiToken: 'test-token' },
};

it('uses native Alchemy ordering, retention, and final stage cleanup', async () => {
  const deleted: string[] = [];
  const events: string[] = [];
  await Effect.runPromise(
    Effect.gen(function* () {
      const state = yield* InMemoryService({
        App: {
          dev: {
            Database: row('Database', { downstream: ['Worker'] }),
            Worker: row('Worker'),
            Retained: row('Retained', { removalPolicy: 'retain' }),
          },
          prod: { Production: row('Production') },
        },
      });
      const analysis: string[] = [];
      const { plan } = yield* prepare(input, state, (event) =>
        analysis.push(`${event.kind}:${event.id}`),
      ).pipe(Effect.provideService(State, Effect.succeed(state)));
      expect(analysis).toEqual([
        'analyzing:Database',
        'analyzed:Database',
        'analyzing:Retained',
        'analyzed:Retained',
        'analyzing:Worker',
        'analyzed:Worker',
      ]);
      expect(deleted).toEqual([]);
      if (!plan) throw new Error('Expected executable plan');
      yield* apply(plan).pipe(
        Effect.provideService(State, Effect.succeed(state)),
      );
      expect(deleted.indexOf('Worker')).toBeLessThan(
        deleted.indexOf('Database'),
      );
      expect(deleted).not.toContain('Retained');
      expect(yield* state.listStages('App')).toEqual(['prod']);
      expect(events).toContain('retained');
    }).pipe(
      Effect.scoped,
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(
        Layer.succeed(TestProvider, {
          list: () => Effect.succeed([]),
          reconcile: () => Effect.succeed({}),
          delete: ({ id }) =>
            Effect.sync(() => {
              deleted.push(id);
            }),
        }),
      ),
      Effect.provideService(Stack, {
        name: 'App',
        stage: 'dev',
        resources: {},
        bindings: {},
        actions: {},
      }),
      Effect.provideService(Stage, 'dev'),
      Effect.provideService(Cli, {
        approvePlan: () => Effect.succeed(false),
        displayPlan: () => Effect.void,
        startApplySession: () =>
          Effect.succeed({
            emit: (event) =>
              Effect.sync(() => {
                if (event.kind === 'status-change') events.push(event.status);
              }),
            done: () => Effect.void,
          }),
      }),
    ),
  );
});

it('keeps unresolved native state after provider failure and blocks dependencies', async () => {
  const deleteResource = vi.fn((id: string) =>
    id === 'Worker' ? Effect.fail(new Error('permission denied')) : Effect.void,
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const state = yield* InMemoryService({
        App: {
          dev: {
            Database: row('Database', { downstream: ['Worker'] }),
            Worker: row('Worker'),
          },
        },
      });
      const { plan } = yield* prepare(input, state).pipe(
        Effect.provideService(State, Effect.succeed(state)),
      );
      const result = yield* Effect.exit(
        apply(plan!).pipe(Effect.provideService(State, Effect.succeed(state))),
      );
      expect(Exit.isFailure(result)).toBe(true);
      expect(yield* state.listStages('App')).toContain('dev');
      expect(yield* state.list({ stack: 'App', stage: 'dev' })).toEqual([
        'Database',
        'Worker',
      ]);
      expect(deleteResource).not.toHaveBeenCalledWith('Database');
    }).pipe(
      Effect.scoped,
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(
        Layer.succeed(TestProvider, {
          list: () => Effect.succeed([]),
          reconcile: () => Effect.succeed({}),
          delete: ({ id }) => deleteResource(id),
        }),
      ),
      Effect.provideService(Stack, {
        name: 'App',
        stage: 'dev',
        resources: {},
        bindings: {},
        actions: {},
      }),
      Effect.provideService(Stage, 'dev'),
      Effect.provideService(Cli, {
        approvePlan: () => Effect.succeed(false),
        displayPlan: () => Effect.void,
        startApplySession: () =>
          Effect.succeed({ emit: () => Effect.void, done: () => Effect.void }),
      }),
    ),
  );
});

it('reviews every resource and distinguishes missing credentials from unsupported types', async () => {
  const events: unknown[] = [];
  await Effect.runPromise(
    Effect.gen(function* () {
      const state = yield* InMemoryService({
        App: {
          dev: {
            BankTable: row('BankTable', { resourceType: 'AWS.DynamoDB.Table' }),
            Custom: row('Custom', { resourceType: 'Custom.Resource' }),
            Worker: row('Worker'),
          },
        },
      });
      const result = yield* prepare(input, state, (event) =>
        events.push(event),
      ).pipe(Effect.provideService(State, Effect.succeed(state)));
      expect(result.plan).toBeNull();
      expect(result.resources.map((r) => [r.id, r.readiness])).toEqual([
        ['BankTable', 'missing-credentials'],
        ['Custom', 'unsupported'],
        ['Worker', 'ready'],
      ]);
      expect(events).toEqual([
        { kind: 'analyzing', id: 'BankTable', type: 'AWS.DynamoDB.Table' },
        { kind: 'analyzed', id: 'BankTable', type: 'AWS.DynamoDB.Table' },
        { kind: 'analyzing', id: 'Custom', type: 'Custom.Resource' },
        { kind: 'analyzed', id: 'Custom', type: 'Custom.Resource' },
        { kind: 'analyzing', id: 'Worker', type: 'Cloudflare.Test' },
        { kind: 'analyzed', id: 'Worker', type: 'Cloudflare.Test' },
      ]);
      const reason = (rows: Record<string, ResourceState>) =>
        Effect.gen(function* () {
          const state = yield* InMemoryService({ App: { dev: rows } });
          const review = yield* prepare(input, state).pipe(
            Effect.provideService(State, Effect.succeed(state)),
          );
          return review.resources[0]?.reason ?? '';
        });
      expect(
        yield* reason({ Queue: row('Queue', { attr: { id: 'dev:1' } }) }),
      ).toContain('local mode');
      expect(
        yield* reason({
          Worker: row('Worker', { attr: { accountId: 'other' } }),
        }),
      ).toContain('different Cloudflare account');
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(
        Layer.succeed(TestProvider, {
          list: () => Effect.succeed([]),
          reconcile: () => Effect.succeed({}),
          delete: () => Effect.void,
        }),
      ),
    ),
  );
});

it('checks previous generations before planning and detects state changes', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const unsafe = {
        ...row('Worker'),
        status: 'replaced' as const,
        deleteFirst: false,
        old: row('Worker', { resourceType: 'Command' }),
      } as ResourceState;
      const state = yield* InMemoryService({
        App: { dev: { Worker: unsafe } },
      });
      const result = yield* prepare(input, state).pipe(
        Effect.provideService(State, Effect.succeed(state)),
      );
      expect(result.plan).toBeNull();
      expect(result.resources[0]?.reason).toContain(
        'Previous version (Command)',
      );
      yield* state.set({
        stack: 'App',
        stage: 'dev',
        fqn: 'Worker',
        value: row('Worker'),
      });
      const before = yield* prepare(input, state).pipe(
        Effect.provideService(State, Effect.succeed(state)),
      );
      yield* state.set({
        stack: 'App',
        stage: 'dev',
        fqn: 'Worker',
        value: row('Worker', { props: { changed: true } }),
      });
      const after = yield* prepare(input, state).pipe(
        Effect.provideService(State, Effect.succeed(state)),
      );
      expect(after.fingerprint).not.toBe(before.fingerprint);
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provide(
        Layer.succeed(TestProvider, {
          list: () => Effect.succeed([]),
          reconcile: () => Effect.succeed({}),
          delete: () => Effect.void,
        }),
      ),
    ),
  );
});
