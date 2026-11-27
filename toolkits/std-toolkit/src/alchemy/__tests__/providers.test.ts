import { Effect, Exit, type Layer } from 'effect';
import { expect, it } from 'vitest';
import { providers } from '../alchemy.js';
import { Providers } from '../collection/index.js';

const registered = (type: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return (yield* Providers).get(type);
    }).pipe(
      // Only reconciling a D1 or DynamoDB table needs Cloudflare's or AWS's
      // providers; registering them does not.
      Effect.provide(providers() as Layer.Layer<Providers>),
    ),
  );

const lifecycle = {
  id: 'TasksDeployGuard',
  fqn: 'TasksDeployGuard',
  instanceId: 'instance',
  olds: {},
  output: {},
  news: {},
  session: undefined as never,
  bindings: [],
};

it.each([
  'StdToolkit.D1.Table',
  'StdToolkit.DynamoDB.SnapshotCheck',
  'StdToolkit.DynamoDB.SnapshotRecord',
])('registers %s', async (type) => {
  expect(await registered(type)).toBeDefined();
});

it.each(['StdToolkit.DeployGuard', 'StdToolkit.SnapshotGuard'])(
  'keeps the retired %s registered, so a stage deletes the ones it holds',
  async (type) => {
    const provider = (await registered(type))!;
    await expect(
      Effect.runPromise(provider.delete(lifecycle)),
    ).resolves.toBeUndefined();

    const exit = await Effect.runPromiseExit(provider.reconcile(lifecycle));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(Exit.isFailure(exit) ? exit.cause : '')).toMatch(
      new RegExp(`${type.replace('.', '\\.')} is retired`),
    );
  },
);
