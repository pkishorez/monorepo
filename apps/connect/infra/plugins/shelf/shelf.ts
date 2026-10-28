import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Action, Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { SHELF_PATH, shelfKey } from '../../../src/cloud/contract/index.ts';

/*
 * The Shelf: where each Release's file is kept, named by its hash and
 * never changed, as `<name>/<sha256>.mjs` under the Shelf's root (see
 * cloud/contract). Putting a file there answers where a Connection reads
 * it, the `url` its `PLUGINS` names. Two kinds:
 *
 * - r2      the Stage's R2 bucket, which Cloud Connect serves at
 *           `<cloud>/plugins/<name>/<sha256>.mjs`, for every Stage
 *           Cloudflare runs. The deploy writes through the bucket's
 *           binding, and the Worker waits on it.
 * - folder  a folder on this computer, read as a `file:` URL, for
 *           `alchemy dev`.
 *
 * Another kind, such as a GitHub release's assets, is one more `Shelf`.
 */

/** A Release's file, to put on a Shelf. */
export interface ShelfFile {
  readonly name: string;
  readonly hash: string;
  /** Where the file is on this computer. */
  readonly file: string;
}

/** Where Releases' files are kept. */
export interface Shelf<R = never> {
  /** Puts `file` on the Shelf unless it is there; once it is, where a Connection reads it. */
  readonly put: (
    file: ShelfFile,
  ) => Effect.Effect<Output.Output<string>, never, R>;
}

/** A Release's file never changes: its name is its hash. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** The Stage's bucket of Plugin files, the R2 Shelf. */
export const PluginFiles = Cloudflare.R2.Bucket(
  'PluginFiles',
  Effect.gen(function* () {
    const stage = yield* Stage;
    // Only prod's files outlive their Stage; a preview's go with it.
    return { name: `connect-plugins-${stage}`, forceDestroy: stage !== 'prod' };
  }),
);

/** Uploads the file at `file` to the bucket at `key`, unless it is there: its key. */
const PublishPlugin = Action(
  'PublishPlugin',
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(yield* PluginFiles);
    return Effect.fn(function* ({
      key,
      file,
    }: {
      readonly key: string;
      readonly file: string;
    }) {
      if ((yield* bucket.head(key)) === null)
        yield* bucket.put(key, readFileSync(file), {
          httpMetadata: {
            contentType: 'text/javascript; charset=utf-8',
            cacheControl: IMMUTABLE,
          },
        });
      return key;
    });
  }).pipe(Effect.provide(Cloudflare.R2.ReadWriteBucketLocal)),
);

/** The R2 Shelf, served by Cloud Connect at `origin`. It holds one Plugin, `code`: its Action has one id. */
export const r2Shelf = (origin: string) => ({
  put: ({ name, hash, file }: ShelfFile) => {
    // R2 keeps each file at the path Cloud Connect serves it at.
    const path = `${SHELF_PATH}/${shelfKey(name, hash)}`;
    return Effect.map(PublishPlugin({ key: path.slice(1), file }), (key) =>
      Output.map(key, () => `${origin.replace(/\/+$/, '')}${path}`),
    );
  },
});

/** The Shelf in the folder `root`: each file at `<root>/<name>/<sha256>.mjs`, read as a `file:` URL. */
export const folderShelf = (root: string): Shelf => ({
  put: ({ name, hash, file }) =>
    Effect.sync(() => {
      const at = join(root, shelfKey(name, hash));
      if (!existsSync(at)) {
        mkdirSync(dirname(at), { recursive: true });
        copyFileSync(file, at);
      }
      return Output.literal(pathToFileURL(at).href);
    }),
});
