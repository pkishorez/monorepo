import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Action, Stage } from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import {
  RELEASE_PATH,
  releaseKey,
} from '../../../src/cloud/worker/store/index.ts';

/*
 * Where each Release File is kept, named by its hash and never changed, as
 * `<name>/<sha256>.mjs` under its root (see src/cloud/worker/store/). Putting
 * a file there answers where a Connection reads it, the `url` `RELEASES`
 * names. Two kinds:
 *
 * - r2      the Stage's R2 bucket, which Connect Cloud serves at
 *           `<cloud>/releases/<name>/<sha256>.mjs`, for every Stage
 *           Cloudflare runs. The deploy writes through the bucket's
 *           binding, and the Worker waits on it.
 * - folder  a folder on this computer, read as a `file:` URL, for
 *           `alchemy dev`.
 */

/** A Release File to keep. */
export interface ReleaseFile {
  readonly name: string;
  readonly hash: string;
  /** Where the file is on this computer. */
  readonly file: string;
}

/** Where Release Files are kept. */
export interface FileStore<R = never> {
  /** Keeps `file` unless it is there; once it is, where a Connection reads it. */
  readonly put: (
    file: ReleaseFile,
  ) => Effect.Effect<Output.Output<string>, never, R>;
}

/** A Release File never changes: its name is its hash. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** The Stage's bucket of Release Files. */
export const ReleaseFiles = Cloudflare.R2.Bucket(
  'ReleaseFiles',
  Effect.gen(function* () {
    const stage = yield* Stage;
    // Only prod's files outlive their Stage; a preview's go with it.
    return {
      name: `connect-releases-${stage}`,
      forceDestroy: stage !== 'prod',
    };
  }),
);

/** Uploads the file at `file` to the bucket at `key`, unless it is there: its key. */
const PublishRelease = Action(
  'PublishRelease',
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(yield* ReleaseFiles);
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

/** Release Files in R2, served by Connect Cloud at `origin`. It holds one Plugin, `code`: its Action has one id. */
export const r2Files = (origin: string) => ({
  put: ({ name, hash, file }: ReleaseFile) => {
    // R2 keeps each file at the path Connect Cloud serves it at.
    const path = `${RELEASE_PATH}/${releaseKey(name, hash)}`;
    return Effect.map(PublishRelease({ key: path.slice(1), file }), (key) =>
      Output.map(key, () => `${origin.replace(/\/+$/, '')}${path}`),
    );
  },
});

/** Release Files in the folder `root`: each at `<root>/<name>/<sha256>.mjs`, read as a `file:` URL. */
export const folderFiles = (root: string): FileStore => ({
  put: ({ name, hash, file }) =>
    Effect.sync(() => {
      const at = join(root, releaseKey(name, hash));
      if (!existsSync(at)) {
        mkdirSync(dirname(at), { recursive: true });
        copyFileSync(file, at);
      }
      return Output.literal(pathToFileURL(at).href);
    }),
});
