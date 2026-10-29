import { Arbitrary, Data, Effect, Option, Result, Schema } from 'effect';
import {
  findNestedESchemas,
  inspectESchema,
  type ESchemaIntrospection,
} from '../domain/introspection/index.js';
import { findNonPortableValue } from '../domain/portable-value/index.js';
import { readToGap } from '../domain/encoded/index.js';
import { findNeedsBackfill } from '../domain/eschema-error/index.js';
import type {
  AnyESchema,
  AnyEvolvingSchema,
} from '../domain/schema-model/index.js';

export interface UpgradeCheckOptions {
  /** Generated values per version. Defaults to 100. */
  readonly runs?: number;
  /**
   * Chooses the generated values. A fixed default keeps a test deterministic;
   * change it to explore other values.
   */
  readonly seed?: string | number;
}

const DEFAULT_SEED = 'std-toolkit/eschema';

type Stage =
  | 'backfill'
  | 'upgrade'
  | 'identity'
  | 'unchanged'
  | 'save'
  | 'stable'
  | 'adoption';

/** A schema to check, and the value paths an upgrade must leave as they were. */
export interface UpgradeRoot {
  readonly schema: AnyEvolvingSchema;
  readonly unchanged?: readonly string[];
}

/** Follows a dotted path through a value; `undefined` when a step is missing. */
const valueAt = (value: unknown, path: string): unknown => {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

class UpgradeFailure extends Data.TaggedError('UpgradeFailure')<{
  readonly stage: Stage;
  readonly message: string;
}> {}

/** One stored row of a version: the value it was written from, and its encoded form. */
interface StoredRow {
  readonly value: unknown;
  readonly stored: unknown;
}

const messageOf = (error: unknown): string => {
  const messages: string[] = [];
  let current: unknown = error;
  while (
    current !== null &&
    typeof current === 'object' &&
    messages.length < 5
  ) {
    const { message, cause } = current as {
      message?: unknown;
      cause?: unknown;
    };
    if (typeof message === 'string' && message !== '') messages.push(message);
    current = cause;
  }
  return messages.length === 0 ? String(error) : messages.join(': ');
};

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** JSON with sorted keys, so two values compare by content, not reference. */
const canonical = (value: unknown): string =>
  JSON.stringify(json(value) ?? null, (_, nested: unknown) =>
    nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.entries(nested).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : nested,
  );

const stamp = (
  kind: ESchemaIntrospection['kind'],
  version: string,
  encoded: unknown,
): unknown =>
  kind === 'value'
    ? { _v: version, _value: encoded }
    : { ...(encoded as object), _v: version };

/**
 * Rows a version can store: values valid at that version, encoded with that
 * version's own fields and stamped with it. A value the version cannot store
 * as JSON is discarded, since no such row can exist; encoding refuses it.
 */
const storedRows = (
  introspection: ESchemaIntrospection,
  index: number,
): Arbitrary.Arbitrary<StoredRow> => {
  const { kind, evolutions } = introspection;
  const { version } = evolutions[index]!;
  const schema = evolutions[index]!.schema as Schema.Codec<unknown, unknown>;
  const encode = Schema.encodeOption(schema);
  return Arbitrary.schema(Schema.toType(schema)).pipe(
    Arbitrary.filterMap((value: unknown) => {
      const encoded = encode(value);
      if (Option.isNone(encoded)) return Result.fail(value);
      const stored = stamp(kind, version, encoded.value);
      return findNonPortableValue(stored) === undefined
        ? Result.succeed({ value, stored })
        : Result.fail(value);
    }),
  );
};

const step = <A, E>(stage: Stage, effect: Effect.Effect<A, E>) =>
  effect.pipe(
    Effect.mapError(
      (error) => new UpgradeFailure({ stage, message: messageOf(error) }),
    ),
  );

/** The first gap version after version `index`, if any. */
const gapAfter = (
  introspection: ESchemaIntrospection,
  index: number,
): string | undefined =>
  introspection.evolutions.slice(index + 1).find((evolution) => evolution.gap)
    ?.version;

/**
 * What an upgraded row must keep from the value it was stored from: its id,
 * and every `unchanged` path it had.
 */
const kept = (
  introspection: ESchemaIntrospection,
  unchanged: readonly string[],
  value: unknown,
  upgraded: unknown,
) =>
  Effect.gen(function* () {
    const { idField } = introspection;
    if (idField !== null) {
      const before = (value as Record<string, unknown>)[idField];
      const after = (upgraded as Record<string, unknown>)[idField];
      if (before !== after) {
        return yield* new UpgradeFailure({
          stage: 'identity',
          message: `${idField} changed from ${JSON.stringify(before)} to ${JSON.stringify(after)}`,
        });
      }
    }
    for (const path of unchanged) {
      // A path the old version did not have yet has nothing to keep.
      const before = valueAt(value, path);
      const after = valueAt(upgraded, path);
      if (before !== undefined && canonical(before) !== canonical(after)) {
        return yield* new UpgradeFailure({
          stage: 'unchanged',
          message: `${path} changed from ${JSON.stringify(before)} to ${JSON.stringify(after)}`,
        });
      }
    }
  });

/**
 * What a stored row before a gap version must survive: it does not read but
 * fails with `NeedsBackfill` for that gap, and its migrations up to the gap
 * run and keep its id and every `unchanged` path. The Backfill is not run.
 */
const waitsForBackfill =
  (
    eschema: AnyEvolvingSchema,
    introspection: ESchemaIntrospection,
    gap: string,
    unchanged: readonly string[],
  ) =>
  ({ value, stored }: StoredRow) =>
    Effect.gen(function* () {
      const codec = eschema.schema as Schema.Codec<unknown, unknown>;
      const read = yield* Effect.exit(
        Schema.decodeUnknownEffect(codec)(json(stored)),
      );
      const found =
        read._tag === 'Failure' ? findNeedsBackfill(read.cause) : undefined;
      if (found?.gapVersion !== gap) {
        return yield* new UpgradeFailure({
          stage: 'backfill',
          message:
            read._tag === 'Success'
              ? `it read without a Backfill for gap version ${gap}`
              : `it failed with something other than NeedsBackfill for ${gap}: ${messageOf(read.cause)}`,
        });
      }
      const reached = yield* step(
        'upgrade',
        readToGap(eschema as AnyESchema, json(stored)),
      );
      yield* kept(introspection, unchanged, value, reached.value);
      return true;
    });

/**
 * What a stored row must survive: it reads as the latest value, keeps its id
 * and every `unchanged` path it had, saves again, and reads back the same.
 */
const upgrades =
  (
    eschema: AnyEvolvingSchema,
    introspection: ESchemaIntrospection,
    index: number,
    unchanged: readonly string[],
  ) =>
  ({ value, stored }: StoredRow) =>
    Effect.gen(function* () {
      const codec = eschema.schema as Schema.Codec<unknown, unknown>;
      const decode = Schema.decodeUnknownEffect(codec);
      const encode = Schema.encodeEffect(codec);

      const latest = yield* step('upgrade', decode(json(stored)));
      yield* kept(introspection, unchanged, value, latest);
      const saved = json(yield* step('save', encode(latest)));
      const again = json(
        yield* step('stable', decode(saved).pipe(Effect.flatMap(encode))),
      );
      if (JSON.stringify(again) !== JSON.stringify(saved)) {
        return yield* new UpgradeFailure({
          stage: 'stable',
          message: `saving and reading again gave ${JSON.stringify(again)}, not ${JSON.stringify(saved)}`,
        });
      }
      if (introspection.kind === 'value' && index === 0) {
        // A value saved before it was versioned has no envelope and reads as v1.
        const raw = (stored as { readonly _value: unknown })._value;
        yield* step('adoption', decode(json(raw)));
      }
      return true;
    });

/**
 * The roots and every ESchema they nest, each once. A nested schema keeps no
 * paths: what must stay unchanged is the root's to say.
 */
const reachable = (roots: readonly UpgradeRoot[]): readonly UpgradeRoot[] => {
  const found = new Map<object, string[]>();
  const pending: object[] = [];
  for (const { schema, unchanged = [] } of roots) {
    const paths = found.get(schema);
    if (paths === undefined) {
      found.set(schema, [...unchanged]);
      pending.push(schema);
    } else {
      paths.push(...unchanged.filter((path) => !paths.includes(path)));
    }
  }
  while (pending.length > 0) {
    const next = pending.shift()!;
    for (const { schema } of inspectESchema(next).evolutions) {
      for (const { eschema } of findNestedESchemas(schema.ast)) {
        if (!found.has(eschema)) {
          found.set(eschema, []);
          pending.push(eschema);
        }
      }
    }
  }
  return [...found].map(([schema, unchanged]) => ({
    schema: schema as AnyEvolvingSchema,
    unchanged,
  }));
};

const checkVersion = (
  eschema: AnyEvolvingSchema,
  introspection: ESchemaIntrospection,
  index: number,
  unchanged: readonly string[],
  options: UpgradeCheckOptions,
): Effect.Effect<string | undefined> => {
  const { name, evolutions } = introspection;
  const version = evolutions[index]!.version;
  const latest = evolutions.at(-1)!.version;
  const gap = gapAfter(introspection, index);
  const label =
    gap !== undefined
      ? `${name} ${version} → gap ${gap}`
      : version === latest
        ? `${name} ${version}`
        : `${name} ${version} → ${latest}`;
  let rows: Arbitrary.Arbitrary<StoredRow>;
  try {
    rows = storedRows(introspection, index);
  } catch (cause) {
    return Effect.succeed(
      `${label}: values could not be generated: ${messageOf(cause)}`,
    );
  }
  return Arbitrary.checkEffect(
    rows,
    gap === undefined
      ? upgrades(eschema, introspection, index, unchanged)
      : waitsForBackfill(eschema, introspection, gap, unchanged),
    {
      runs: options.runs ?? 100,
      seed: options.seed ?? DEFAULT_SEED,
    },
  ).pipe(
    Effect.map((result) => {
      switch (result._tag) {
        case 'Passed':
          return undefined;
        case 'Falsified': {
          const failure =
            result.failure._tag === 'PropertyError'
              ? (result.failure.error as UpgradeFailure)
              : new UpgradeFailure({
                  stage: 'upgrade',
                  message: 'the property returned false',
                });
          return [
            `${label}: ${failure.stage} failed: ${failure.message}`,
            `  stored row: ${JSON.stringify(result.shrunkInput.stored)}`,
          ].join('\n');
        }
        case 'Exhausted':
          return `${label}: too few storable values were generated (${result.discards} discarded); a check or conversion rejects most of them`;
        case 'ReplayMismatch':
          return `${label}: replay mismatch (${result.reason})`;
      }
    }),
  );
};

/**
 * Every version of every root, and of every ESchema they nest, that has a
 * stored row it cannot upgrade: one report entry per failing version, with
 * its smallest failing row. Empty when all upgrade.
 */
export const findUpgradeFailures = (
  roots: readonly UpgradeRoot[],
  options: UpgradeCheckOptions = {},
): Effect.Effect<readonly string[]> =>
  Effect.forEach(reachable(roots), ({ schema, unchanged = [] }) => {
    const introspection = inspectESchema(schema);
    return Effect.forEach(introspection.evolutions, (_, index) =>
      checkVersion(schema, introspection, index, unchanged, options),
    );
  }).pipe(
    Effect.map((failures) =>
      failures.flat().filter((line) => line !== undefined),
    ),
  );

/**
 * Generates rows every version of `schema` can store, and of every ESchema it
 * nests, and checks that each one reads as the latest value, keeps its id and
 * every `unchanged` path, and saves again unchanged. A row stored before a
 * gap version must instead fail with `NeedsBackfill` and migrate up to the
 * gap; the Backfill itself is not run. Resolves when all do;
 * otherwise rejects with one entry per failing version and its smallest
 * failing row. Works in any test runner.
 */
export async function expectUpgradable(
  schema: AnyEvolvingSchema,
  options: UpgradeCheckOptions & {
    /** Value paths, such as `boardId`, that no migration may change. */
    readonly unchanged?: readonly string[];
  } = {},
): Promise<void> {
  const { unchanged, ...check } = options;
  const report = await Effect.runPromise(
    findUpgradeFailures(
      [{ schema, ...(unchanged === undefined ? {} : { unchanged }) }],
      check,
    ),
  );
  if (report.length > 0) {
    throw new Error(
      [
        `${schema.name} has stored versions that do not upgrade:`,
        '',
        ...report,
      ].join('\n'),
    );
  }
}
