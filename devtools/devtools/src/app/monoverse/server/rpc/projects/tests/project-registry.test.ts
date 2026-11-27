import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { ProjectStore } from '../../../services/project-store/contract/index.js';
import { makeSqliteProjectStore } from '../../../services/project-store/real/project-store.js';
import { ProjectsRpc } from '../contract/index.js';
import { projectsRpcLayer } from '../real/index.js';

let folder: string;
beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), 'monoverse-projects-')));
  await mkdir(join(folder, 'alpha'));
  await writeFile(join(folder, 'file.txt'), '');
  await symlink(join(folder, 'alpha'), join(folder, 'alpha-link'));
});
afterEach(() => rm(folder, { recursive: true, force: true }));

describe('the Projects RPC, on the Project registry', () => {
  test('AddProject takes an absolute folder that exists, its links resolved', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeSqliteProjectStore({
            path: ':memory:',
          });
          const rpc = yield* ProjectsRpc.accessHandler('AddProject').pipe(
            Effect.provide(
              projectsRpcLayer().pipe(
                Layer.provide(Layer.succeed(ProjectStore, store)),
              ),
            ),
          );
          const add = (path: string) =>
            rpc({ path }, {} as never).pipe(
              Effect.provideService(ProjectStore, store),
            );
          const linked = yield* add(join(folder, 'alpha-link'));
          expect(linked.path).toBe(join(folder, 'alpha'));
          for (const [path, message] of [
            ['relative/path', 'absolute'],
            [join(folder, 'missing'), 'does not exist'],
            [join(folder, 'file.txt'), 'not a folder'],
          ] as const) {
            const error = yield* add(path).pipe(Effect.flip);
            expect(error).toMatchObject({
              _tag: 'ProjectRegistryError',
              reason: 'invalid-path',
            });
            expect(error.message).toContain(message);
          }
        }),
      ),
    ));
});
