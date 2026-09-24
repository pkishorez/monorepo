import { Effect, Schema } from 'effect';
import { FastCheck } from 'effect/testing';
import type { ESchemaIntrospection } from '../../eschema/domain/introspection/index.js';
import { collectESchemas } from '../capture/eschema-capture/index.js';
import type {
  GoldenRow,
  GoldenStep,
  JsonValue,
  TableSnapshot,
  TableSnapshotFile,
} from '../domain/index.js';
import { compareStrings, stableStringify } from '../domain/index.js';

/** Fixed, so the same code draws the same rows on every machine. */
const SEED = 20260924;
/** How many rows pin one migration step. Not a contract term: a step keeps
 * the rows it was first pinned with even if this changes later. */
const ROWS_PER_STEP = 20;
/** Rows drawn that fail their own version's decode are dropped; this bounds
 * how many draws are made to find `ROWS_PER_STEP` that pass. */
const DRAW_LIMIT = ROWS_PER_STEP * 5;

export class GoldenRowError extends Error {
  readonly _tag = 'GoldenRowError';

  constructor(
    readonly schema: string,
    readonly from: string,
    readonly to: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`${schema} ${from} → ${to}: ${message}`);
    this.name = 'GoldenRowError';
  }
}

/** What the file capture needs from a table: its snapshot and its entities' ESchemas. */
export interface GoldenRowTable {
  snapshot(): TableSnapshot;
  readonly registeredEntities: readonly { readonly schema: object }[];
}

type Evolution = ESchemaIntrospection['evolutions'][number];

/** The persisted shape of one version: fields plus stamp, or the value envelope. */
type PersistedSchema = Schema.Codec<any, any, never, never>;

const persistedSchema = (
  kind: ESchemaIntrospection['kind'],
  evolution: Evolution,
): PersistedSchema =>
  (kind === 'value'
    ? Schema.Struct({
        _v: Schema.Literal(evolution.version),
        value: evolution.schema,
      })
    : Schema.Struct({
        ...(evolution.schema as Schema.Struct<Schema.Struct.Fields>).fields,
        _v: Schema.Literal(evolution.version),
      })) as unknown as PersistedSchema;

const jsonRoundTrip = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;

/** Runs one migration step on one persisted value of `from`, yielding the persisted value at `to`. */
const migrateOnce = (
  kind: ESchemaIntrospection['kind'],
  from: Evolution,
  to: Evolution,
  input: JsonValue,
): Effect.Effect<JsonValue, unknown> =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(
      persistedSchema(kind, from),
    )(input);
    const previous =
      kind === 'value' ? (decoded as { value: unknown }).value : decoded;
    const migrated = yield* Effect.try(() => to.migration!(previous));
    const encoded = yield* Schema.encodeUnknownEffect(
      persistedSchema(kind, to),
    )(
      kind === 'value'
        ? { _v: to.version, value: migrated }
        : { ...(migrated as object), _v: to.version },
    );
    return jsonRoundTrip(encoded);
  });

/** Draws persisted values of `from` that survive a JSON round trip and decode. */
const drawInputs = (
  kind: ESchemaIntrospection['kind'],
  from: Evolution,
): readonly JsonValue[] => {
  const schema = persistedSchema(kind, from);
  const arbitrary = Schema.toArbitrary(Schema.toEncoded(schema))(FastCheck);
  const decode = Schema.decodeUnknownSync(schema);
  const inputs: JsonValue[] = [];
  for (const drawn of FastCheck.sample(arbitrary, {
    seed: SEED,
    numRuns: DRAW_LIMIT,
  })) {
    if (inputs.length >= ROWS_PER_STEP) break;
    const input = jsonRoundTrip(drawn);
    try {
      decode(input);
    } catch {
      continue;
    }
    inputs.push(input);
  }
  return inputs;
};

const stepKey = (schema: string, from: string, to: string): string =>
  `${schema}\u0000${from}\u0000${to}`;

/**
 * Golden rows for every migration step of every ESchema the table reaches,
 * nested ones included. A step already present in `prior` replays its stored
 * inputs, so a change in the generator can never look like a rewritten
 * migration; only a step new to the file draws fresh inputs.
 */
export function captureGoldenRows(
  table: GoldenRowTable,
  prior?: TableSnapshotFile,
): Effect.Effect<readonly GoldenStep[], GoldenRowError> {
  return Effect.gen(function* () {
    const stored = new Map(
      (prior?.goldenRows ?? []).map((step) => [
        stepKey(step.schema, step.from, step.to),
        step,
      ]),
    );
    const entries = yield* Effect.try({
      try: () =>
        collectESchemas(
          table.registeredEntities.map(({ schema }) => ({ eschema: schema })),
        ),
      catch: (cause) =>
        new GoldenRowError('<table>', '', '', 'cannot collect ESchemas', cause),
    });
    const steps: GoldenStep[] = [];
    for (const { identity, introspection } of entries) {
      const { kind, evolutions } = introspection;
      for (let index = 1; index < evolutions.length; index++) {
        const from = evolutions[index - 1]!;
        const to = evolutions[index]!;
        const fail = (message: string, cause?: unknown) =>
          new GoldenRowError(
            identity,
            from.version,
            to.version,
            message,
            cause,
          );
        const inputs =
          stored
            .get(stepKey(identity, from.version, to.version))
            ?.rows.map((row) => row.input) ??
          (yield* Effect.try({
            try: () => drawInputs(kind, from),
            catch: (cause) =>
              fail('cannot generate values for this version', cause),
          }));
        const rows: GoldenRow[] = [];
        for (const input of inputs) {
          const output = yield* migrateOnce(kind, from, to, input).pipe(
            Effect.mapError((cause) =>
              fail(
                `the migration failed on ${stableStringify(input)}; migrations must accept every value the previous version can hold`,
                cause,
              ),
            ),
          );
          rows.push({ input, output });
        }
        steps.push({
          schema: identity,
          from: from.version,
          to: to.version,
          rows,
        });
      }
    }
    return steps.sort(
      (a, b) =>
        compareStrings(a.schema, b.schema) || compareStrings(a.from, b.from),
    );
  });
}

/** The document a test suite commits per table: contract plus golden rows. */
export function captureTableSnapshotFile(
  table: GoldenRowTable,
  prior?: TableSnapshotFile,
): Effect.Effect<TableSnapshotFile, GoldenRowError> {
  return captureGoldenRows(table, prior).pipe(
    Effect.map((goldenRows) => ({ snapshot: table.snapshot(), goldenRows })),
  );
}
