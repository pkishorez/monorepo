import { Effect, Logger, Schema, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../../eschema/index.js';
import {
  SnapshotDecodeError,
  SnapshotIncompatible,
  type TableSnapshot,
} from '../../../../snapshot/index.js';
import {
  contractLayer,
  type EncodedData,
  type StdTableContract,
} from '../../contract/index.js';
import { StdTable } from '../../table/index.js';
import { ENFORCEMENT_KEY } from '../../key/index.js';
import { makeDeterministicContract } from '../../__tests__/deterministic-contract.js';
import {
  BaselineMissing,
  setupTable,
  TableBaselineESchema,
  type TableBaseline,
} from '../index.js';

/** Physical steps that only record the order they ran in. */
const physical = () => {
  const calls: string[] = [];
  return {
    calls,
    steps: {
      ensure: Effect.sync(() => {
        calls.push('ensure');
      }),
      reconcile: Effect.sync(() => {
        calls.push('reconcile');
      }),
    },
  };
};

const setup = (
  contract: StdTableContract,
  table: { snapshot(): TableSnapshot },
  steps = physical().steps,
) => setupTable(contract, table.snapshot(), steps);

const storedBaseline = (
  contract: StdTableContract,
): Promise<TableBaseline | null> =>
  Effect.runPromise(
    contract
      .getItem(ENFORCEMENT_KEY, { consistent: true })
      .pipe(
        Effect.flatMap((item) =>
          item === null
            ? Effect.succeed(null)
            : TableBaselineESchema.decode(item.data),
        ),
      ),
  );

const encodedBaseline = (snapshot: TableSnapshot): Promise<EncodedData> =>
  Effect.runPromise(
    TableBaselineESchema.encode({
      snapshot,
      floors: {},
      owedBackfills: [],
    }).pipe(Effect.map((data) => data as unknown as EncodedData)),
  );

const raceFirstWriteWith = (
  contract: StdTableContract,
  competing: EncodedData,
  condition: 'not-exists' | 'updated',
): StdTableContract => {
  let raced = false;
  return {
    ...contract,
    writeItem: (request) => {
      if (raced || request.condition?.kind !== condition) {
        return contract.writeItem(request);
      }
      raced = true;
      return contract
        .writeItem({
          ...request,
          item: {
            ...request.item,
            meta: { ...request.item.meta, _u: 'competing-writer' },
            data: competing,
          },
        })
        .pipe(Effect.andThen(contract.writeItem(request)));
    },
  };
};

const note = EntityESchema.make('Note', 'id', { title: Schema.String }).build();

describe('table-level enforcement inside setup', () => {
  it('bootstraps the baseline on an empty table, ensuring before and reconciling after the check', async () => {
    const logicalName = 'enforce-bootstrap';
    const table = StdTable.make(logicalName).primary('pk', 'sk').build();
    table
      .entity(note)
      .primary({ pk: ['title'] })
      .build();
    const deterministic = makeDeterministicContract(logicalName);
    const { calls, steps } = physical();

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* setup(deterministic.contract, table, steps);
        yield* setup(deterministic.contract, table, steps);
      }),
    );

    expect(calls).toEqual(['ensure', 'reconcile', 'ensure', 'reconcile']);
    const stored = await storedBaseline(deterministic.contract);
    expect(stored?.snapshot).toEqual(table.snapshot());
    expect(stored?.floors).toEqual({ Note: 'v1' });
    expect(stored?.owedBackfills).toEqual([]);
  });

  it('refuses a table that already holds rows but has no baseline', async () => {
    const logicalName = 'enforce-populated';
    const table = StdTable.make(logicalName).primary('pk', 'sk').build();
    const noteEntity = table
      .entity(note)
      .primary({ pk: ['title'] })
      .build();
    const deterministic = makeDeterministicContract(logicalName);
    const { calls, steps } = physical();

    await Effect.runPromise(
      noteEntity
        .insert({ id: 'n1', title: 'hello' })
        .pipe(Effect.provide(deterministic.layer)),
    );
    const outcome = await Effect.runPromise(
      setup(deterministic.contract, table, steps).pipe(Effect.result),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(BaselineMissing);
    }
    expect(calls).toEqual(['ensure']);
    expect(await storedBaseline(deterministic.contract)).toBeNull();
  });

  it('rechecks a baseline captured by a competing bootstrap writer', async () => {
    const logicalName = 'enforce-bootstrap-race';
    const current = StdTable.make(logicalName).primary('pk', 'sk').build();
    const competing = StdTable.make(logicalName)
      .primary('partitionKey', 'sortKey')
      .build();
    const deterministic = makeDeterministicContract(logicalName);
    const contract = raceFirstWriteWith(
      deterministic.contract,
      await encodedBaseline(competing.snapshot()),
      'not-exists',
    );

    const outcome = await Effect.runPromise(
      setup(contract, current).pipe(Effect.result),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(SnapshotIncompatible);
    }
    const stored = await storedBaseline(deterministic.contract);
    expect(stored?.snapshot).toEqual(competing.snapshot());
  });

  it('advances the baseline on a safe change and floors the new entity at its latest version', async () => {
    const logicalName = 'enforce-safe';
    const before = StdTable.make(logicalName).primary('pk', 'sk').build();
    before
      .entity(note)
      .primary({ pk: ['title'] })
      .build();
    const task = EntityESchema.make('Task', 'id', { title: Schema.String })
      .evolve('v2', { done: Schema.Boolean }, (previous) => ({
        ...previous,
        done: false,
      }))
      .build();
    const after = StdTable.make(logicalName).primary('pk', 'sk').build();
    after
      .entity(note)
      .primary({ pk: ['title'] })
      .build();
    after
      .entity(task)
      .primary({ pk: ['title'] })
      .build();
    const deterministic = makeDeterministicContract(logicalName);

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* setup(deterministic.contract, before);
        yield* setup(deterministic.contract, after);
        yield* setup(deterministic.contract, after);
      }),
    );

    const stored = await storedBaseline(deterministic.contract);
    expect(stored?.snapshot).toEqual(after.snapshot());
    expect(stored?.floors).toEqual({ Note: 'v1', Task: 'v2' });
  });

  it('never raises an existing floor when its entity gains a version', async () => {
    const logicalName = 'enforce-floor';
    const before = StdTable.make(logicalName).primary('pk', 'sk').build();
    before
      .entity(note)
      .primary({ pk: ['title'] })
      .build();
    const noteV2 = EntityESchema.make('Note', 'id', { title: Schema.String })
      .evolve('v2', { pinned: Schema.Boolean }, (previous) => ({
        ...previous,
        pinned: false,
      }))
      .build();
    const after = StdTable.make(logicalName).primary('pk', 'sk').build();
    after
      .entity(noteV2)
      .primary({ pk: ['title'] })
      .build();
    const deterministic = makeDeterministicContract(logicalName);

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* setup(deterministic.contract, before);
        yield* setup(deterministic.contract, after);
      }),
    );

    expect((await storedBaseline(deterministic.contract))?.floors).toEqual({
      Note: 'v1',
    });
  });

  it('rechecks a baseline updated by a competing writer', async () => {
    const logicalName = 'enforce-update-race';
    const wide = EntityESchema.make('Note', 'id', {
      title: Schema.String,
      status: Schema.String,
    }).build();
    const before = StdTable.make(logicalName).primary('pk', 'sk').build();
    const current = StdTable.make(logicalName).primary('pk', 'sk').build();
    current
      .entity(wide)
      .primary({ pk: ['title'] })
      .build();
    const competing = StdTable.make(logicalName).primary('pk', 'sk').build();
    competing
      .entity(wide)
      .primary({ pk: ['status'] })
      .build();
    const deterministic = makeDeterministicContract(logicalName);
    await Effect.runPromise(setup(deterministic.contract, before));
    const contract = raceFirstWriteWith(
      deterministic.contract,
      await encodedBaseline(competing.snapshot()),
      'updated',
    );

    const outcome = await Effect.runPromise(
      setup(contract, current).pipe(Effect.result),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(SnapshotIncompatible);
    }
    const stored = await storedBaseline(deterministic.contract);
    expect(stored?.snapshot).toEqual(competing.snapshot());
  });

  it('records an owed backfill on a requires-backfill change and prunes it once its subject is gone', async () => {
    const logicalName = 'enforce-backfill';
    const wide = EntityESchema.make('Note', 'id', {
      title: Schema.String,
      status: Schema.String,
    }).build();
    const topology = () =>
      StdTable.make(logicalName)
        .primary('pk', 'sk')
        .gsi('GSI1', 'GSI1PK', 'GSI1SK')
        .build();
    const before = topology();
    before
      .entity(wide)
      .primary({ pk: ['title'] })
      .build();
    const after = topology();
    after
      .entity(wide)
      .primary({ pk: ['title'] })
      .index('GSI1', 'byStatus', { pk: ['title'], sk: ['status'] })
      .build();
    const deterministic = makeDeterministicContract(logicalName);
    const warnings: string[] = [];
    const collector = Logger.make<unknown, void>((options) => {
      if (options.logLevel === 'Warn') {
        warnings.push(
          Array.isArray(options.message)
            ? options.message.map(String).join(' ')
            : String(options.message),
        );
      }
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* setup(deterministic.contract, before);
        yield* setup(deterministic.contract, after);
        yield* setup(deterministic.contract, after);
      }).pipe(Effect.provide(Logger.layer([collector]))),
    );

    expect(
      warnings.filter((message) => message.includes('backfill')),
    ).toHaveLength(1);
    const owed = await storedBaseline(deterministic.contract);
    expect(owed?.snapshot).toEqual(after.snapshot());
    expect(owed?.owedBackfills).toHaveLength(1);
    expect(owed?.owedBackfills[0]?.change).toMatchObject({
      impact: 'requires-backfill',
      subject: { kind: 'access-pattern', owner: 'Note', name: 'byStatus' },
    });
    expect(owed?.owedBackfills[0]?.accepted).toMatch(/^[0-9A-Z]{26}$/);

    // Dropping the access pattern again is safe, and the debt goes with it.
    await Effect.runPromise(setup(deterministic.contract, before));
    expect(
      (await storedBaseline(deterministic.contract))?.owedBackfills,
    ).toEqual([]);
  });

  it('refuses a breaking change without reconciling and leaves the baseline untouched', async () => {
    const logicalName = 'enforce-breaking';
    const before = StdTable.make(logicalName).primary('pk', 'sk').build();
    const after = StdTable.make(logicalName)
      .primary('partitionKey', 'sortKey')
      .build();
    const deterministic = makeDeterministicContract(logicalName);
    const { calls, steps } = physical();

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        yield* setup(deterministic.contract, before);
        const result = yield* setup(deterministic.contract, after, steps).pipe(
          Effect.result,
        );
        // The baseline is still "before": re-running it must still match.
        yield* setup(deterministic.contract, before);
        return result;
      }),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(SnapshotIncompatible);
    }
    expect(calls).toEqual(['ensure']);
  });

  it('refuses a baseline it cannot read instead of replacing it', async () => {
    const logicalName = 'enforce-unreadable';
    const table = StdTable.make(logicalName).primary('pk', 'sk').build();
    const deterministic = makeDeterministicContract(logicalName);
    await Effect.runPromise(
      deterministic.contract.writeItem({
        item: {
          pk: ENFORCEMENT_KEY.pk,
          sk: ENFORCEMENT_KEY.sk,
          meta: { _e: '__std_toolkit_enforcement__', _u: '0', _d: false },
          data: { kind: 'table', logicalName } as unknown as EncodedData,
          keys: {},
        },
      }),
    );

    const outcome = await Effect.runPromise(
      setup(deterministic.contract, table).pipe(Effect.result),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(SnapshotDecodeError);
    }
  });

  it('never surfaces the reserved enforcement item through scan', async () => {
    const logicalName = 'enforce-scan-invisible';
    const table = StdTable.make(logicalName).primary('pk', 'sk').build();
    const noteEntity = table
      .entity(note)
      .primary({ pk: ['title'] })
      .build();
    const deterministic = makeDeterministicContract(logicalName);
    const layer = contractLayer(logicalName, deterministic.contract);

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        yield* setup(deterministic.contract, table);
        yield* noteEntity.insert({ id: 'n1', title: 'hello' });
        return Array.from(yield* Stream.runCollect(table.scan()));
      }).pipe(Effect.provide(layer)),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.meta._e).toBe('Note');
  });
});
