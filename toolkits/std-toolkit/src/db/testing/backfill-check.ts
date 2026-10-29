import { Arbitrary, Cause, Data, Effect } from 'effect';
import { readToGap, type AnyESchema } from '../../eschema/index.js';
import { inspectESchema } from '../../eschema/domain/introspection/index.js';
import { planBackfills } from '../setup/backfill/index.js';
import { BackfillFailed, runSetup } from '../setup/index.js';
import type { StoredItem } from '../std-table/contract/index.js';
import type {
  RegisteredBackfill,
  RegisteredEntity,
} from '../std-table/definition/index.js';
import type { StdTable } from '../std-table/table/index.js';
import { memoryStore, owingBackfills } from './pending-setup.js';
import {
  latestItem,
  latestRows,
  oldItem,
  rowsAt,
  type GeneratedRow,
} from './stored-rows.js';

// Runs the Backfills the way setup does, on generated rows: each gap
// Backfill alone, over its entity's rows at the version before the gap, and
// then every Backfill at once, as on a database at the oldest versions,
// whose schedule setup must be able to plan. Other entities hold generated
// rows, none at all included. Every row must end at the latest version with
// its id and partition key as they were.

export interface BackfillCheckOptions {
  /** Generated cases per Backfill, each with and without other rows. Defaults to 100. */
  readonly runs?: number;
  /** Chooses the generated rows; a fixed default keeps a test deterministic. */
  readonly seed?: string | number;
}

const DEFAULT_SEED = 'std-toolkit/db';
const MOST_ROWS = 4;
/** What the runner's message repeats of the report line: the Backfill and the row. */
const RUNNER_PREFIX = /^std-toolkit: Backfill "[^"]*" failed on row \S+: /;

class BackfillCheckFailure extends Data.TaggedError('BackfillCheckFailure')<{
  readonly message: string;
}> {}

/** Rows owed a Backfill: an entity's, at the version before its gap. */
interface Owed {
  readonly entity: RegisteredEntity;
  readonly from: string;
}

/** A database to set up: the Backfills it owes, and whose rows are older. */
interface Scenario {
  readonly label: string;
  readonly owing: ReadonlySet<string>;
  readonly owed: readonly Owed[];
  /** Whether the report names the entity of each stored row. */
  readonly several: boolean;
}

/** One generated database: the owed rows, and rows of the other entities, by entity. */
interface Case {
  readonly rows: Readonly<Record<string, readonly GeneratedRow[]>>;
  readonly others: Readonly<Record<string, readonly GeneratedRow[]>>;
}

const fail = (message: string) =>
  Effect.fail(new BackfillCheckFailure({ message }));

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

const valueAt = (value: unknown, path: string): unknown => {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

/** JSON with sorted keys, so two values compare by content. */
const canonical = (value: unknown): string =>
  JSON.stringify(value ?? null, (_, nested: unknown) =>
    nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.entries(nested).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : nested,
  );

/** The paths a Backfill must leave as they were: the id, and the partition key. */
const keptPaths = (entity: RegisteredEntity): readonly string[] => {
  const { idField } = inspectESchema(entity.schema);
  return [
    ...(idField === null ? [] : [idField]),
    ...(entity.kind === 'keyed' ? entity.primary.pk : []),
  ];
};

const keyOf = (item: StoredItem) => JSON.stringify([item.pk, item.sk]);

/** Where the row ended, after setup: at the latest version, with its key paths kept. */
const ended = (
  entity: RegisteredEntity,
  store: ReturnType<typeof memoryStore>,
  item: StoredItem,
  value: unknown,
) =>
  Effect.gen(function* () {
    const after = yield* store
      .getItem(item, { consistent: true })
      .pipe(
        Effect.mapError(
          (cause) => new BackfillCheckFailure({ message: messageOf(cause) }),
        ),
      );
    if (after === null) return yield* fail('the row is gone after setup');
    const latest = entity.schema.latestVersion;
    if (after.data._v !== latest)
      return yield* fail(
        `the row ended at ${after.data._v}, not the latest version ${latest}`,
      );
    const read = yield* readToGap(entity.schema as AnyESchema, after.data).pipe(
      Effect.mapError(
        (cause) =>
          new BackfillCheckFailure({
            message: `the rewritten row does not read: ${messageOf(cause)}`,
          }),
      ),
    );
    for (const path of keptPaths(entity)) {
      const before = valueAt(value, path);
      const now = valueAt(read.value, path);
      if (canonical(before) !== canonical(now))
        return yield* fail(
          `${path} changed from ${JSON.stringify(before)} to ${JSON.stringify(now)}`,
        );
    }
  });

/**
 * One generated database, set up: the owed rows and the other rows are
 * written under a contract that owes the scenario's Backfills, setup runs on
 * a Memory table, and every owed row must end where it should.
 */
const setsUp = (table: StdTable, scenario: Scenario) => (input: Case) =>
  Effect.gen(function* () {
    const store = memoryStore(table);
    const owed = new Map<
      string,
      { entity: RegisteredEntity; item: StoredItem; value: unknown }
    >();
    for (const { entity } of scenario.owed)
      for (const row of input.rows[entity.name] ?? []) {
        const item = yield* oldItem(entity, row);
        owed.set(keyOf(item), { entity, item, value: row.value });
      }
    const others: StoredItem[] = [];
    for (const other of table.registeredEntities)
      for (const row of input.others[other.name] ?? [])
        others.push(
          yield* latestItem(table, other, row).pipe(
            Effect.mapError(
              (cause) =>
                new BackfillCheckFailure({
                  message: `a ${other.name} row could not be written: ${messageOf(cause)}`,
                }),
            ),
          ),
        );
    yield* owingBackfills(store, table, scenario.owing, [
      ...others,
      ...[...owed.values()].map(({ item }) => item),
    ]).pipe(
      Effect.mapError(
        (cause) =>
          new BackfillCheckFailure({
            message: `the rows could not be written: ${messageOf(cause)}`,
          }),
      ),
    );
    const setup = yield* Effect.exit(
      runSetup({ table, mode: 'persistent', store }),
    );
    if (setup._tag === 'Failure') {
      const error = Cause.squash(setup.cause);
      return yield* fail(
        error instanceof BackfillFailed
          ? `${scenario.owing.size === 1 && scenario.owing.has(error.backfill) ? '' : `Backfill "${error.backfill}" `}${error.message.replace(RUNNER_PREFIX, '')}`
          : `setup failed: ${messageOf(error)}`,
      );
    }
    for (const { entity, item, value } of owed.values())
      yield* ended(entity, store, item, value);
    return true;
  });

const previousVersion = (entity: RegisteredEntity, version: string) => {
  const versions = inspectESchema(entity.schema).evolutions.map(
    (evolution) => evolution.version,
  );
  return versions[versions.indexOf(version) - 1]!;
};

const rowsJson = (
  rows: Readonly<Record<string, readonly GeneratedRow[]>>,
): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(rows)
        .filter(([, entityRows]) => entityRows.length > 0)
        .map(([name, entityRows]) => [
          name,
          entityRows.map(({ data }) => data),
        ]),
    ),
  );

const report = (
  scenario: Scenario,
  result: Arbitrary.CheckResult<Case, BackfillCheckFailure>,
): string | undefined => {
  const { label } = scenario;
  switch (result._tag) {
    case 'Passed':
      return undefined;
    case 'Falsified': {
      const { rows, others } = result.shrunkInput;
      const message =
        result.failure._tag === 'PropertyError'
          ? result.failure.error.message
          : 'the check returned false';
      const seeded = Object.values(others).some(
        (entityRows) => entityRows.length > 0,
      );
      return [
        `${label}: ${message}`,
        ...Object.entries(rows).flatMap(([name, entityRows]) =>
          entityRows.map(
            ({ data }) =>
              `  stored ${scenario.several ? `${name} ` : ''}row: ${JSON.stringify(data)}`,
          ),
        ),
        seeded
          ? `  other rows: ${rowsJson(others)}`
          : '  other entities: empty',
      ].join('\n');
    }
    case 'Exhausted':
      return `${label}: too few storable rows were generated (${result.discards} discarded); a check or conversion rejects most of them`;
    case 'ReplayMismatch':
      return `${label}: replay mismatch (${result.reason})`;
  }
};

const rowsOf = (entity: RegisteredEntity, version: string, minLength: number) =>
  // A single entity has one row; a keyed one, a few to share a scan.
  Arbitrary.array(rowsAt(entity, version), {
    minLength,
    maxLength: entity.kind === 'single' ? 1 : MOST_ROWS,
  });

const checkScenario = (
  table: StdTable,
  scenario: Scenario,
  options: BackfillCheckOptions,
): Effect.Effect<string | undefined> => {
  let cases: readonly Arbitrary.Arbitrary<Case>[];
  try {
    const owedNames = new Set(scenario.owed.map(({ entity }) => entity.name));
    const rows = Arbitrary.all(
      Object.fromEntries(
        scenario.owed.map(({ entity, from }) => [
          entity.name,
          rowsOf(entity, from, 1),
        ]),
      ),
    );
    const others = table.registeredEntities.filter(
      ({ name }) => !owedNames.has(name),
    );
    cases = [
      // Every other entity empty first: a Backfill that reads one must
      // still succeed when it holds nothing.
      Arbitrary.map(rows, (generated): Case => ({
        rows: generated,
        others: {},
      })),
      Arbitrary.all({
        rows,
        others: Arbitrary.all(
          Object.fromEntries(
            others.map((other) => [
              other.name,
              rowsOf(other, other.schema.latestVersion, 0),
            ]),
          ),
        ),
      }),
    ];
  } catch (cause) {
    return Effect.succeed(
      `${scenario.label}: rows could not be generated: ${messageOf(cause)}`,
    );
  }
  const check = {
    runs: options.runs ?? 100,
    seed: options.seed ?? DEFAULT_SEED,
  };
  return Effect.gen(function* () {
    for (const generated of cases) {
      const result = yield* Arbitrary.checkEffect(
        generated,
        setsUp(table, scenario),
        check,
      );
      const failure = report(scenario, result);
      if (failure !== undefined) return failure;
    }
    return undefined;
  });
};

const entityOf = (table: StdTable, name: string) =>
  table.registeredEntities.find((entity) => entity.name === name)!;

/** One gap Backfill owed alone, over its entity's rows at the version before it. */
const alone = (table: StdTable, backfill: RegisteredBackfill): Scenario => {
  const entity = entityOf(table, backfill.entity);
  const from = previousVersion(entity, backfill.to!);
  return {
    label: `Backfill "${backfill.id}" (${entity.name} ${from} → ${backfill.to})`,
    owing: new Set([backfill.id]),
    owed: [{ entity, from }],
    several: false,
  };
};

/**
 * Every Backfill owed at once: each gap entity's rows at the version before
 * its first gap, as a database that skipped every release since.
 */
const allAtOnce = (table: StdTable): Scenario => {
  const firstGaps = new Map<string, string>();
  for (const { kind, entity, to } of table.registeredBackfills)
    if (kind === 'gap' && !firstGaps.has(entity)) firstGaps.set(entity, to!);
  return {
    label: `Every Backfill pending at once, as on a database at the oldest versions (${table.registeredBackfills.map(({ id }) => `"${id}"`).join(', ')})`,
    owing: new Set(table.registeredBackfills.map(({ id }) => id)),
    owed: [...firstGaps].map(([name, gap]) => {
      const entity = entityOf(table, name);
      return { entity, from: previousVersion(entity, gap) };
    }),
    several: true,
  };
};

/**
 * Setup's own plan for every Backfill pending at once: a schedule it would
 * refuse, such as entities whose Backfills wait on one another in a cycle,
 * fails here, naming them.
 */
const checkSchedule = (table: StdTable): Effect.Effect<string | undefined> =>
  planBackfills(
    table,
    table.registeredBackfills.map(({ id }) => id),
  ).pipe(
    Effect.as(undefined),
    Effect.catch((refused) =>
      Effect.succeed(
        `Every Backfill pending at once, as on a database at the oldest versions: setup refuses to order them: ${refused.detail}. Each entity's pending Backfills run in one scan, so \`after\` must not make two entities wait on each other.`,
      ),
    ),
  );

/**
 * Every gap Backfill of `table` that fails on some generated database, one
 * report entry each, with the smallest rows that show it; then the schedule
 * of every Backfill at once, planned and run. Empty when all succeed.
 */
export const findBackfillFailures = (
  table: StdTable,
  options: BackfillCheckOptions = {},
): Effect.Effect<readonly string[]> =>
  Effect.gen(function* () {
    const failures: (string | undefined)[] = [];
    for (const backfill of table.registeredBackfills)
      if (backfill.kind === 'gap')
        failures.push(
          yield* checkScenario(table, alone(table, backfill), options),
        );
    // One Backfill alone was checked already; several can still clash.
    if (table.registeredBackfills.length > 1) {
      const refused = yield* checkSchedule(table);
      failures.push(
        refused ?? (yield* checkScenario(table, allAtOnce(table), options)),
      );
    }
    return failures.filter((line) => line !== undefined);
  });
