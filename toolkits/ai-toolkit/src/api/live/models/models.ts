import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  Clock,
  Context,
  Data,
  Duration,
  Effect,
  Layer,
  Schema,
  Semaphore,
} from 'effect';
import type { ModelInfo } from '../../contract/index.js';
import type { Harness } from '../../../harness/index.js';

/*
 * The models each harness accepts, from models.dev. The catalog is kept in
 * memory for an hour and on disk beside the database, so a server that
 * starts offline still lists what it saw last. A failed refresh falls back
 * to whatever copy is held.
 */

const URL = 'https://models.dev/api.json';
const FRESH_FOR = Duration.hours(1);

const Catalog = Schema.Record(
  Schema.String,
  Schema.Struct({
    models: Schema.optionalKey(
      Schema.Record(
        Schema.String,
        Schema.Struct({
          id: Schema.String,
          name: Schema.optionalKey(Schema.String),
          release_date: Schema.optionalKey(Schema.String),
        }),
      ),
    ),
  }),
);
type Catalog = typeof Catalog.Type;

export class ModelsError extends Data.TaggedError('ModelsError')<{
  readonly message: string;
}> {}

export interface ModelsOptions {
  /** Where the last catalog read is kept for offline starts. */
  readonly cacheFile: string;
  /** Reads the catalog as JSON; models.dev unless given. */
  readonly fetch?: () => Promise<unknown>;
}

const fetchCatalog = () =>
  fetch(URL).then((response) => {
    if (!response.ok) throw new Error(`models.dev answered ${response.status}`);
    return response.json() as Promise<unknown>;
  });

const decode = Schema.decodeUnknownEffect(Catalog);

const make = (options: ModelsOptions) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1);
    let held: { readonly catalog: Catalog; readonly at: number } | undefined;

    const fromDisk = Effect.tryPromise(() =>
      readFile(options.cacheFile, 'utf8').then(JSON.parse),
    ).pipe(Effect.flatMap(decode), Effect.option);

    const toDisk = (raw: unknown) =>
      Effect.tryPromise(async () => {
        await mkdir(dirname(options.cacheFile), { recursive: true });
        await writeFile(options.cacheFile, JSON.stringify(raw));
      }).pipe(Effect.ignore);

    const refresh = Effect.gen(function* () {
      const raw = yield* Effect.tryPromise(options.fetch ?? fetchCatalog);
      const catalog = yield* decode(raw);
      yield* toDisk(raw);
      return catalog;
    });

    const catalog = lock.withPermits(1)(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        if (held && now - held.at < Duration.toMillis(FRESH_FOR))
          return held.catalog;
        const fresh = yield* Effect.option(refresh);
        if (fresh._tag === 'Some') {
          held = { catalog: fresh.value, at: now };
          return fresh.value;
        }
        if (held) return held.catalog;
        const saved = yield* fromDisk;
        if (saved._tag === 'Some') {
          // Kept, but stale: the next call tries models.dev again.
          held = { catalog: saved.value, at: 0 };
          return saved.value;
        }
        return yield* new ModelsError({
          message: 'models.dev is unreachable and no copy is saved',
        });
      }),
    );

    return {
      /** What `harness` accepts, newest first. */
      list: (harness: Harness) =>
        Effect.map(catalog, (all): ReadonlyArray<ModelInfo> =>
          Object.values(all[harness.modelsProvider]?.models ?? {})
            .filter((model) => harness.acceptsModel(model.id))
            .map((model) => ({
              id: model.id,
              name: model.name ?? model.id,
              releaseDate: model.release_date ?? null,
            }))
            .sort((a, b) =>
              (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''),
            ),
        ),
    };
  });

export class Models extends Context.Service<
  Models,
  {
    readonly list: (
      harness: Harness,
    ) => Effect.Effect<ReadonlyArray<ModelInfo>, ModelsError>;
  }
>()('@kestack/ai-toolkit/Models') {
  static readonly layer = (options: ModelsOptions): Layer.Layer<Models> =>
    Layer.effect(Models, make(options));
}
