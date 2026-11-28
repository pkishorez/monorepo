import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  GitUnavailableError,
  InvalidRootError,
  NoPackageJsonError,
  type Workspace,
} from '../../../../server/rpc/project/contract/index.js';
import { FolderError } from '../../../../server/rpc/projects/contract/index.js';
import { Projects } from '../../contract/index.js';
import type { Client } from '../client.js';
import { projectsOn, problemOf } from '../index.js';

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
      check: { _tag: 'Unchecked' },
    },
    {
      name: 'b',
      path: 'packages/b',
      private: false,
      dependencies: [{ name: 'a', kinds: ['dev'] }],
      check: { _tag: 'Unchecked' },
    },
  ],
  cycles: [{ packages: ['a', 'b'] }],
  files: [],
};

const violation = {
  from: 'packages/a/src/x/y.ts',
  line: 1,
  column: 22,
  to: 'packages/a/src/z.ts',
  reason: 'door',
  message: "'src/z.ts' is beside or above this file and is not a door.",
} as const;

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
      check: {
        _tag: 'Checked',
        violations: [violation],
        excepted: [],
        doors: [],
      },
    }),
  GetBranches: () =>
    Effect.fail(new GitUnavailableError({ reason: 'not-a-repo' })),
};

const client = new Proxy({} as Client, {
  get: (_, method: string) => (payload: never) =>
    answers[method]?.(payload) ?? Effect.never,
});

const use = <A, E>(effect: Effect.Effect<A, E, Projects>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.succeed(Projects)(projectsOn(client)))),
  );

describe('Projects service', () => {
  it('analyses a project into its Package links and the links closing a cycle', () =>
    use(
      Effect.gen(function* () {
        const projects = yield* Projects;
        const analysis = yield* projects.analyse({
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

  it("reads a Package with the server's Check, as it came", () =>
    use(
      Effect.gen(function* () {
        const projects = yield* Projects;
        const { check } = yield* projects.readPackage({
          root: '/repo',
          branch: 'main',
          path: 'packages/a',
        });
        expect(check).toEqual({
          _tag: 'Checked',
          violations: [violation],
          excepted: [],
          doors: [],
        });
      }),
    ));

  it('fails in a sentence', () =>
    use(
      Effect.gen(function* () {
        const projects = yield* Projects;
        const problem = yield* Effect.flip(
          projects.branches({ root: '/repo' }),
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
    expect(
      problemOf(
        new FolderError({
          reason: 'not-found',
          path: '/home/me/gone',
          message: 'Not found',
        }),
      ),
    ).toMatchObject({ reason: 'failed', message: 'Not found' });
  });
});
