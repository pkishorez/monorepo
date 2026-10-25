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
import {
  HarnessAccount,
  type AvailableModel,
  type Harness,
} from '../contract/index.js';

/*
 * The models each harness can run. A harness that can ask its login which
 * models it runs is asked (kept in memory for a few minutes), and its list
 * is filled in from models.dev; one that cannot, or whose ask fails, lists
 * the models.dev models it accepts. The catalog is kept in memory for an
 * hour and on disk beside the database, so a server that starts offline
 * still lists what it saw last. A failed refresh falls back to whatever
 * copy is held.
 */

const URL = 'https://models.dev/api.json';
const FRESH_FOR = Duration.hours(1);
const ACCOUNT_FRESH_FOR = Duration.minutes(5);

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
type CatalogModel = NonNullable<Catalog[string]['models']>[string];

const newestFirst = (a: ModelInfo, b: ModelInfo) =>
  (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '');

const toInfo = (model: CatalogModel, name?: string): ModelInfo => ({
  id: model.id,
  name: model.name ?? name ?? model.id,
  releaseDate: model.release_date ?? null,
});

/** The models.dev models `harness` accepts, newest first. */
export const fromCatalog = (
  harness: Harness,
  catalog: Catalog,
): ReadonlyArray<ModelInfo> =>
  Object.values(catalog[harness.modelsProvider]?.models ?? {})
    .filter((model) => harness.acceptsModel(model.id))
    .map((model) => toInfo(model))
    .sort(newestFirst);

/**
 * The account's models, each filled in from models.dev when it lists the
 * same id, newest first; ones models.dev lacks keep the account's name and
 * come last, in the account's order.
 */
export const fromAccount = (
  harness: Harness,
  account: ReadonlyArray<AvailableModel>,
  catalog: Catalog,
): ReadonlyArray<ModelInfo> => {
  const known = catalog[harness.modelsProvider]?.models ?? {};
  return account
    .map((model) =>
      toInfo(
        Object.hasOwn(known, model.id) ? known[model.id]! : model,
        model.name,
      ),
    )
    .sort(newestFirst);
};

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

    // By harness, then by Harness Account: each login runs its own models.
    const asked = new Map<
      Harness,
      Map<
        string,
        {
          readonly lock: Semaphore.Semaphore;
          held?: {
            readonly models: ReadonlyArray<AvailableModel>;
            readonly at: number;
          };
        }
      >
    >();

    /** The account's models, or undefined when the harness cannot say. */
    const account = (harness: Harness) =>
      Effect.gen(function* () {
        const ask = harness.availableModels;
        if (ask === undefined) return undefined;
        const login = yield* HarnessAccount;
        const key = JSON.stringify([login.binary, login.home]);
        let logins = asked.get(harness);
        if (logins === undefined) {
          logins = new Map();
          asked.set(harness, logins);
        }
        let entry = logins.get(key);
        if (entry === undefined) {
          entry = { lock: yield* Semaphore.make(1) };
          logins.set(key, entry);
        }
        const slot = entry;
        return yield* slot.lock.withPermits(1)(
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            if (
              slot.held &&
              now - slot.held.at < Duration.toMillis(ACCOUNT_FRESH_FOR)
            )
              return slot.held.models;
            const result = yield* Effect.result(ask);
            if (result._tag === 'Success') {
              slot.held = { models: result.success, at: now };
              return result.success;
            }
            yield* Effect.logWarning(
              `${harness.label} could not list this account's models; listing models.dev's instead`,
              result.failure,
            );
            return slot.held?.models;
          }),
        );
      });

    return {
      list: (harness: Harness) =>
        Effect.gen(function* () {
          const models = yield* account(harness);
          if (models === undefined || models.length === 0)
            return fromCatalog(harness, yield* catalog);
          const all = yield* Effect.orElseSucceed(catalog, (): Catalog => ({}));
          return fromAccount(harness, models, all);
        }),
      defaultModel: (harness: Harness) =>
        Effect.map(
          account(harness),
          (models) =>
            models?.find((model) => model.isDefault === true)?.id ??
            harness.defaultModel,
        ),
    };
  });

export class Models extends Context.Service<
  Models,
  {
    /** The models `harness` can run as the Harness Account, newest first. */
    readonly list: (
      harness: Harness,
    ) => Effect.Effect<ReadonlyArray<ModelInfo>, ModelsError, HarnessAccount>;
    /** The account's default model, else the harness's own. */
    readonly defaultModel: (
      harness: Harness,
    ) => Effect.Effect<string, never, HarnessAccount>;
  }
>()('@kestack/ai-toolkit/Models') {
  /** Each call asks as the Harness Account it is given. */
  static readonly layer = (options: ModelsOptions): Layer.Layer<Models> =>
    Layer.effect(Models, make(options));
}
