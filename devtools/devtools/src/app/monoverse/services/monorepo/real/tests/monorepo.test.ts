import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  MonoverseClient,
  type MonoverseClientService,
} from '../../../monoverse-client/contract/index.js';
import {
  GitUnavailableError,
  InvalidRootError,
  NoPackageJsonError,
  type Workspace,
} from '../../../../server/rpc/project/contract/index.js';
import { Monorepo } from '../../contract/index.js';
import { monorepoLayer, problemOf } from '../index.js';

/*
 * The Monorepo service on a client that answers what the test says: an
 * analysis carries the Package links and cycles, a Package read carries
 * its Violations, and every failure is one plain sentence.
 */

const workspace: Workspace = {
  kind: 'monorepo',
  name: 'mono',
  path: '/repo',
  packageManager: 'pnpm',
  packages: [
    {
      name: 'a',
      path: 'packages/a',
      private: false,
      dependencies: [{ name: 'b', kinds: ['runtime'] }],
    },
    {
      name: 'b',
      path: 'packages/b',
      private: false,
      dependencies: [{ name: 'a', kinds: ['dev'] }],
    },
  ],
  cycles: [{ packages: ['a', 'b'] }],
  files: [],
};

const answers: Partial<
  Record<string, (payload: never) => Effect.Effect<unknown, unknown>>
> = {
  OpenProject: () => Effect.succeed(workspace),
  ReadPackage: () =>
    Effect.succeed({
      path: 'packages/a',
      files: [],
      sourceRoots: ['packages/a/src'],
      imports: [
        ['packages/a/src/x/y.ts', 'packages/a/src/z.ts'],
        ['packages/a/src/z.ts', 'packages/a/src/x/y.ts'],
      ],
    }),
  GetBranches: () =>
    Effect.fail(new GitUnavailableError({ reason: 'not-a-repo' })),
};

const client = Layer.succeed(MonoverseClient)(
  new Proxy({} as MonoverseClientService, {
    get: (_, method: string) => (payload: never) =>
      answers[method]?.(payload) ?? Effect.never,
  }),
);

const use = <A, E>(effect: Effect.Effect<A, E, Monorepo>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(monorepoLayer.pipe(Layer.provide(client)))),
  );

describe('Monorepo service', () => {
  it('analyses a project into its Package links and the links closing a cycle', () =>
    use(
      Effect.gen(function* () {
        const monorepo = yield* Monorepo;
        const analysis = yield* monorepo.analyse({
          root: '/repo',
          branch: null,
        });
        expect(analysis.links).toEqual([
          ['packages/a', 'packages/b'],
          ['packages/b', 'packages/a'],
        ]);
        expect(analysis.cycles.length).toBeGreaterThan(0);
      }),
    ));

  it('reads a Package with the imports that break the folder rule', () =>
    use(
      Effect.gen(function* () {
        const monorepo = yield* Monorepo;
        const { violations } = yield* monorepo.readPackage({
          root: '/repo',
          branch: 'main',
          path: 'packages/a',
        });
        expect(violations).toEqual([
          ['packages/a/src/x/y.ts', 'packages/a/src/z.ts'],
        ]);
      }),
    ));

  it('fails in a sentence', () =>
    use(
      Effect.gen(function* () {
        const monorepo = yield* Monorepo;
        const problem = yield* Effect.flip(
          monorepo.branches({ root: '/repo' }),
        );
        expect(problem).toMatchObject({
          reason: 'not-git',
          message: 'This project is not in a git repository.',
        });
      }),
    ));

  it('says what is missing, from home', () => {
    expect(
      problemOf(
        new InvalidRootError({ reason: 'not-found', path: '/home/me/gone' }),
      ),
    ).toMatchObject({ reason: 'missing', message: '~/gone does not exist.' });
    expect(
      problemOf(new NoPackageJsonError({ path: '/home/me/notes' })),
    ).toMatchObject({ reason: 'missing' });
    expect(
      problemOf({ _tag: 'RpcClientError', message: 'socket hang up' }),
    ).toMatchObject({
      reason: 'failed',
      message: 'The DevTools server could not be reached: socket hang up',
    });
  });
});
