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
import { Context, Data, Duration, Effect, Layer } from 'effect';
import { lock, tryLock } from './lock.js';
import { messageOf, transfer, type Progress } from './transfer.js';

/*
 * One shared copy of each download on this computer, in the kestack cache.
 * An entry is a folder named by its sha256, or by a key when no hash is
 * known up front, holding the file and a `used` mark. An entry is made in a
 * temporary folder beside it and renamed into place whole, so a download cut
 * short leaves nothing half-written; one process at a time makes an entry,
 * so two that start at once download it once, and the second takes what
 * the first made. Entries not used for a while are pruned; whoever keeps
 * using an entry, such as a Plugin running from it, marks it used again.
 */

export type { Progress };

/** A file to download, known by its sha256. */
export interface Download {
  /** Where it is: `http:` or `https:`, or `file:` to copy one on this computer. */
  readonly url: string;
  /** Its sha256, in hex. */
  readonly sha256: string;
  /** What the file is called in its entry; `file` unless given. */
  readonly name?: string;
}

/** A file made by `produce` at the path it is given, kept under `key`. */
export interface Made<E> {
  readonly key: string;
  readonly name?: string;
  readonly produce: (file: string) => Effect.Effect<void, E>;
}

/**
 * The download failed: the server could not be reached or answered an
 * error, or it broke off. `missing` says a `file:` URL named no file.
 */
export class DownloadFailed extends Data.TaggedError('DownloadFailed')<{
  readonly url: string;
  readonly message: string;
  readonly missing: boolean;
}> {}

/** What arrived is not the file asked for; it was thrown away. */
export class HashMismatch extends Data.TaggedError('HashMismatch')<{
  readonly url: string;
  readonly expected: string;
  readonly actual: string;
}> {}

/** The cache could not be read or written, or its lock not taken. */
export class CacheError extends Data.TaggedError('CacheError')<{
  readonly path: string;
  readonly message: string;
}> {}

/** How long a process waits for another making the same entry. */
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

/** Marks the entry at `entry` as used now. */
const markUsed = (entry: string) =>
  attempt(entry, () => writeFileSync(join(entry, USED), ''));

/** When the entry at `entry` was last used, in epoch ms. */
const usedAt = (entry: string) => {
  const mark = join(entry, USED);
  return (existsSync(mark) ? statSync(mark) : statSync(entry)).mtimeMs;
};

const make = (cache: string) => {
  const root = join(cache, 'downloads');

  /**
   * The file `name` of the entry `key`: there already, or made by `make` in
   * a temporary folder and renamed into place while holding the entry's lock.
   */
  const entry = <E>(
    key: string,
    name: string,
    make: (file: string) => Effect.Effect<void, E>,
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
      yield* lock(folder, WAIT).pipe(Effect.mapError(cacheError(folder)));
      // Another process may have made it while this one waited.
      if (!existsSync(file)) {
        const partial = yield* Effect.acquireRelease(
          attempt(root, () => mkdtempSync(join(root, `${PARTIAL}${key}-`))),
          (partial) =>
            Effect.sync(() =>
              rmSync(partial, { recursive: true, force: true }),
            ),
        );
        yield* make(join(partial, name));
        yield* attempt(folder, () => {
          // An entry of this key with another file is replaced whole.
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
          // A partial folder is a download that died: its entry's lock is free.
          const key = name.startsWith(PARTIAL)
            ? name.slice(PARTIAL.length).replace(/-[^-]*$/, '')
            : name;
          if (!name.startsWith(PARTIAL)) {
            if (kept.has(key)) continue;
            if ((yield* attempt(folder, () => usedAt(folder))) > before)
              continue;
          }
          const free = yield* tryLock(join(root, key)).pipe(
            Effect.mapError(cacheError(folder)),
          );
          if (!free) continue;
          yield* attempt(folder, () =>
            rmSync(folder, { recursive: true, force: true }),
          );
          if (!name.startsWith(PARTIAL)) removed.push(key);
        }
        return removed;
      }).pipe(Effect.scoped),
  });
};

/** One shared copy of each download, in a kestack cache folder. */
export class Downloads extends Context.Service<
  Downloads,
  {
    /**
     * The path of the file `sha256` names, downloaded from `url` unless it
     * is in the cache; telling `onProgress` how far it is. A `file:` URL is
     * copied the same way. A file that is not the one asked for fails with
     * HashMismatch and is thrown away.
     */
    readonly fetch: (
      download: Download,
      onProgress?: (progress: Progress) => Effect.Effect<void>,
    ) => Effect.Effect<string, DownloadFailed | HashMismatch | CacheError>;
    /** The path of the file kept under `key`, made by `produce` unless it is in the cache. */
    readonly ensure: <E>(
      made: Made<E>,
    ) => Effect.Effect<string, E | CacheError>;
    /** Marks the entry `key` used now, if it is there, so `prune` keeps it. */
    readonly use: (key: string) => Effect.Effect<void, CacheError>;
    /**
     * Deletes every entry not used within `olderThan` and not in `keep`,
     * and what downloads that died left; answers the keys deleted.
     */
    readonly prune: (options: {
      readonly olderThan: Duration.Input;
      readonly keep?: ReadonlyArray<string>;
    }) => Effect.Effect<ReadonlyArray<string>, CacheError>;
  }
>()('@kestack/cli-platform/Downloads') {
  /** Downloads kept in `cache`, the kestack cache folder. */
  static readonly layer = (cache: string) =>
    Layer.sync(Downloads, () => make(cache));
}
