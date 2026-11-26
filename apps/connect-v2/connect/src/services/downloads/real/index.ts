import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Duration, Effect, Layer } from 'effect';
import { Locks } from '../../locks/contract/index.js';
import {
  CacheError,
  DownloadFailed,
  Downloads,
  HashMismatch,
} from '../contract/index.js';
import { messageOf, transfer } from './transfer.js';

const WAIT = Duration.minutes(30);
const SHA256 = /^[a-f0-9]{64}$/;
const KEY = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const USED = 'used';
const PARTIAL = '.partial-';

const cacheError = (path: string) => (cause: unknown) =>
  new CacheError({ path, message: messageOf(cause) });

const attempt = <A>(path: string, run: () => A) =>
  Effect.try({ try: run, catch: cacheError(path) });

const check = (path: string, test: boolean, problem: string) =>
  test ? Effect.void : Effect.fail(new CacheError({ path, message: problem }));

const markUsed = (entry: string) =>
  attempt(entry, () => writeFileSync(join(entry, USED), ''));

const usedAt = (entry: string) => {
  const mark = join(entry, USED);
  return (existsSync(mark) ? statSync(mark) : statSync(entry)).mtimeMs;
};

const make = (cache: string, locks: Locks['Service']) => {
  const root = join(cache, 'downloads');

  const entry = <E>(
    key: string,
    name: string,
    produce: (file: string) => Effect.Effect<void, E>,
  ) =>
    Effect.gen(function* () {
      const folder = join(root, key);
      const file = join(folder, name);
      yield* check(folder, KEY.test(key), `"${key}" is not a cache key`);
      yield* check(
        folder,
        NAME.test(name) && name !== USED,
        `"${name}" is not a file name`,
      );
      if (existsSync(file)) {
        yield* markUsed(folder);
        return file;
      }
      yield* attempt(root, () => mkdirSync(root, { recursive: true }));
      yield* locks.hold(folder, WAIT).pipe(Effect.mapError(cacheError(folder)));
      if (!existsSync(file)) {
        const partial = yield* Effect.acquireRelease(
          attempt(root, () => mkdtempSync(join(root, `${PARTIAL}${key}-`))),
          (made) =>
            Effect.sync(() => rmSync(made, { recursive: true, force: true })),
        );
        yield* produce(join(partial, name));
        yield* attempt(folder, () => {
          rmSync(folder, { recursive: true, force: true });
          renameSync(partial, folder);
        });
      }
      yield* markUsed(folder);
      return file;
    }).pipe(Effect.scoped);

  return Downloads.of({
    fetch: ({ url, sha256, name = 'file' }, onProgress = () => Effect.void) => {
      const expected = sha256.toLowerCase();
      return Effect.gen(function* () {
        yield* check(
          root,
          SHA256.test(expected),
          `"${sha256}" is not a sha256 in hex`,
        );
        return yield* entry(expected, name, (file) =>
          transfer(url, file, onProgress).pipe(
            Effect.mapError(
              ({ message, missing }) =>
                new DownloadFailed({ url, message, missing }),
            ),
            Effect.flatMap((actual) =>
              actual === expected
                ? Effect.void
                : Effect.fail(new HashMismatch({ url, expected, actual })),
            ),
          ),
        );
      });
    },
    ensure: ({ key, name = 'file', produce }) => entry(key, name, produce),
    use: (key) =>
      Effect.suspend(() => {
        const folder = join(root, key.toLowerCase());
        return KEY.test(key.toLowerCase()) && existsSync(folder)
          ? markUsed(folder)
          : Effect.void;
      }),
    prune: ({ olderThan, keep = [] }) =>
      Effect.gen(function* () {
        if (!existsSync(root)) return [];
        const before =
          Date.now() - Duration.toMillis(Duration.fromInputUnsafe(olderThan));
        const kept = new Set(keep.map((key) => key.toLowerCase()));
        const removed: Array<string> = [];
        for (const name of yield* attempt(root, () => readdirSync(root))) {
          const folder = join(root, name);
          const partial = name.startsWith(PARTIAL);
          const key = partial
            ? name.slice(PARTIAL.length).replace(/-[^-]*$/, '')
            : name;
          if (!partial) {
            if (kept.has(key)) continue;
            if ((yield* attempt(folder, () => usedAt(folder))) > before)
              continue;
          }
          const free = yield* locks
            .tryHold(join(root, key))
            .pipe(Effect.mapError(cacheError(folder)));
          if (!free) continue;
          yield* attempt(folder, () =>
            rmSync(folder, { recursive: true, force: true }),
          );
          if (!partial) removed.push(key);
        }
        return removed;
      }).pipe(Effect.scoped),
  });
};

export const layer = (cache: string) =>
  Layer.effect(
    Downloads,
    Effect.map(Locks, (locks) => make(cache, locks)),
  );
