import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';
import { SpeechToTextError, type Fetched } from '../contract/index.js';
import { download } from './download.js';

/*
 * sherpa-onnx's Node runtime, fetched with the model rather than shipped
 * with this package: `sherpa-onnx-node` and the package holding its native
 * addon for this platform, about 35 MB, from the npm registry at one
 * pinned version. Each tarball is checked against the registry's sha512
 * before it is unpacked, by the system's `tar`, into
 * `<folder>/runtime/node_modules`, where `sherpa-onnx-node` finds its
 * addon beside it. A package is there only once its `package.json` is.
 */

/** The sherpa-onnx release Speech to Text runs. */
export const SHERPA_VERSION = '1.13.8';

export const NPM_REGISTRY = 'https://registry.npmjs.org';

const RUNTIME = 'runtime';

/** sherpa-onnx names Windows `win`. */
const addonPackage = () =>
  `sherpa-onnx-${process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`;

/** The runtime's packages, `sherpa-onnx-node` first. */
export const runtimePackages = () => ['sherpa-onnx-node', addonPackage()];

const modules = (folder: string) => join(folder, RUNTIME, 'node_modules');

const Manifest = Schema.Struct({
  dist: Schema.Struct({ tarball: Schema.String, integrity: Schema.String }),
});

const failed = (message: string) => (cause?: unknown) =>
  new SpeechToTextError({ message, cause });

const exists = (path: string) =>
  Effect.promise(() =>
    access(path).then(
      () => true,
      () => false,
    ),
  );

/** Whether every package of the runtime is unpacked in `folder`. */
export const runtimeInstalled = (folder: string) =>
  Effect.gen(function* () {
    for (const name of runtimePackages())
      if (!(yield* exists(join(modules(folder), name, 'package.json'))))
        return false;
    return true;
  });

const manifest = (registry: string, name: string) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(`${registry}/${name}/${SHERPA_VERSION}`, { signal }),
      catch: failed(`Could not reach ${registry}`),
    });
    if (response.status === 404)
      return yield* failed(
        `Speech to Text does not run on ${process.platform}-${process.arch}`,
      )();
    if (!response.ok)
      return yield* failed(`${registry} answered ${response.status}`)();
    const body = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: failed(`${registry} sent no manifest for ${name}`),
    });
    return yield* Schema.decodeUnknownEffect(Manifest)(body).pipe(
      Effect.mapError(failed(`${registry} sent no tarball for ${name}`)),
    );
  });

/** Whether `file` hashes to an `sha512-<base64>` integrity. */
const matches = (file: string, integrity: string) =>
  Effect.promise(
    () =>
      new Promise<boolean>((resolve) => {
        const [algorithm, expected] = integrity.split('-', 2);
        if (algorithm !== 'sha512' || expected === undefined)
          return resolve(false);
        const hash = createHash('sha512');
        createReadStream(file)
          .on('data', (chunk) => hash.update(chunk))
          .on('error', () => resolve(false))
          .on('end', () => resolve(hash.digest('base64') === expected));
      }),
  );

/** Unpacks an npm tarball's `package/` into `into`; why it failed, or null. */
const unpack = (tarball: string, into: string) =>
  Effect.callback<string | null>((resume) => {
    const child = execFile(
      'tar',
      ['-xzf', tarball, '-C', into, '--strip-components=1'],
      (error, _stdout, stderr) =>
        resume(
          Effect.succeed(
            error === null ? null : stderr.trim() || error.message,
          ),
        ),
    );
    return Effect.sync(() => void child.kill());
  });

const installPackage = (
  folder: string,
  registry: string,
  name: string,
  progress: (done: number) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const into = join(modules(folder), name);
    if (yield* exists(join(into, 'package.json'))) return;
    const { dist } = yield* manifest(registry, name);
    // Unpacked beside its place, and named only once whole.
    const part = `${into}.part`;
    yield* Effect.tryPromise({
      try: async () => {
        await rm(part, { recursive: true, force: true });
        await mkdir(part, { recursive: true });
      },
      catch: failed(`Could not make ${part}`),
    });
    const tarball = join(folder, RUNTIME, `${name}.tgz`);
    yield* download(dist.tarball, tarball, ({ done }) => progress(done));
    const intact = yield* matches(tarball, dist.integrity);
    const why = intact ? yield* unpack(tarball, part) : null;
    yield* Effect.promise(() => rm(tarball, { force: true }));
    if (!intact || why !== null) {
      yield* Effect.promise(() => rm(part, { recursive: true, force: true }));
      return yield* failed(
        intact
          ? `${name} did not unpack: ${why}`
          : `${name} did not match its checksum`,
      )();
    }
    yield* Effect.tryPromise({
      try: () => rename(part, into),
      catch: failed(`Could not keep ${name}`),
    });
  });

/**
 * Fetches the runtime into `folder` from `registry`, reporting the bytes
 * as they arrive; their total is not known ahead.
 */
export const installRuntime = (
  folder: string,
  registry: string,
  progress: (fetched: Fetched) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    let before = 0;
    for (const name of runtimePackages()) {
      let last = 0;
      yield* installPackage(folder, registry, name, (done) => {
        last = done;
        return progress({ done: before + done, total: null });
      });
      before += last;
    }
    return before;
  });

/** `sherpa-onnx-node` from the runtime in `folder`; it loads its addon as it is required. */
export const requireSherpa = (
  folder: string,
): typeof import('sherpa-onnx-node') =>
  createRequire(join(folder, RUNTIME, 'index.js'))('sherpa-onnx-node');
