import { Effect, Logger, Schema, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../../eschema/index.js';
import {
  SnapshotIncompatible,
  type TableSnapshot,
} from '../../../../snapshot/index.js';
import {
  contractLayer,
  type EncodedData,
  type EncodedItem,
  type StdTableContract,
} from '../../contract/index.js';
import { StdTable } from '../../table/index.js';
import { TABLE_STATE_KEY } from '../../key/index.js';
import { makeDeterministicContract } from '../../__tests__/deterministic-contract.js';

// A competing writer from before the record held epochs: it stores the bare
// snapshot, which enforcement must still read as a baseline.
const raceFirstWriteWith = (
  contract: StdTableContract,
  competing: TableSnapshot,
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
            data: competing as unknown as EncodedData,
          },
        })
        .pipe(Effect.andThen(contract.writeItem(request)));
    },
  };
};

const storedState = (contract: StdTableContract) =>
  Effect.runPromise(
    contract.getItem(TABLE_STATE_KEY, { consistent: true }).pipe(
      Effect.map(
        (item: EncodedItem | null) =>
          item?.data as unknown as
            | {
                readonly _v: string;
                readonly snapshot: TableSnapshot | null;
                readonly entities: Record<string, { epoch: string }>;
                readonly backfill: readonly {
                  readonly subject: { kind: string; name?: string };
                  readonly since: string;
                }[];
              }
            | undefined,
      ),
    ),
  );

describe('table-level snapshot enforcement', () => {
  it('bootstraps the baseline on first run, then matches with no changes', async () => {
    const logicalName = 'enforce-bootstrap';
    const note = EntityESchema.make('Note', 'id', {
      title: Schema.String,
    }).build();
    const table = StdTable.make(logicalName).primary('pk', 'sk').build();
    table
      .entity(note)
      .primary({ pk: ['title'] })
      .build();

    const deterministic = makeDeterministicContract(logicalName);
    const layer = contractLayer(logicalName, deterministic.contract);

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* table.verifySnapshot();
        yield* table.verifySnapshot();
      }).pipe(Effect.provide(layer)),
    );

    const stored = await storedState(deterministic.contract);
    expect(stored?._v).toBe('v1');
    expect(stored?.snapshot).toEqual(table.snapshot());
    expect(Object.keys(stored?.entities ?? {})).toEqual(['Note']);
    expect(stored?.backfill).toEqual([]);
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
      competing.snapshot(),
      'not-exists',
    );

    const outcome = await Effect.runPromise(
      current
        .verifySnapshot()
        .pipe(
          Effect.result,
          Effect.provide(contractLayer(logicalName, contract)),
        ),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(SnapshotIncompatible);
    }
    const stored = await Effect.runPromise(
      deterministic.contract.getItem(TABLE_STATE_KEY, { consistent: true }),
    );
    expect(stored?.data).toEqual(competing.snapshot());
  });

  it('auto-updates the baseline on a safe change (new entity) and gives the entity an epoch', async () => {
    const logicalName = 'enforce-safe';
    const note = EntityESchema.make('Note', 'id', {
      title: Schema.String,
    }).build();
    const before = StdTable.make(logicalName).primary('pk', 'sk').build();
    before
      .entity(note)
      .primary({ pk: ['title'] })
      .build();

    const task = EntityESchema.make('Task', 'id', {
      title: Schema.String,
    }).build();
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
    const layer = contractLayer(logicalName, deterministic.contract);

    const noteEpochBefore = await Effect.runPromise(
      Effect.gen(function* () {
        yield* before.verifySnapshot();
        return (yield* before.state()).entities['Note']?.epoch;
      }).pipe(Effect.provide(layer)),
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* after.verifySnapshot();
        yield* after.verifySnapshot();
      }).pipe(Effect.provide(layer)),
    );

    const stored = await storedState(deterministic.contract);
    expect(stored?.snapshot).toEqual(after.snapshot());
    expect(Object.keys(stored?.entities ?? {}).sort()).toEqual([
      'Note',
      'Task',
    ]);
    expect(stored?.entities['Note']?.epoch).toBe(noteEpochBefore);
    expect(stored?.entities['Task']?.epoch).toBeTruthy();
  });

  it('rechecks a baseline updated by a competing writer', async () => {
    const logicalName = 'enforce-update-race';
    const note = EntityESchema.make('Note', 'id', {
      title: Schema.String,
      status: Schema.String,
    }).build();
    const before = StdTable.make(logicalName).primary('pk', 'sk').build();
    const current = StdTable.make(logicalName).primary('pk', 'sk').build();
    current
      .entity(note)
      .primary({ pk: ['title'] })
      .build();
    const competing = StdTable.make(logicalName).primary('pk', 'sk').build();
    competing
      .entity(note)
      .primary({ pk: ['status'] })
      .build();

    const deterministic = makeDeterministicContract(logicalName);
    await Effect.runPromise(
      before
        .verifySnapshot()
        .pipe(
          Effect.provide(contractLayer(logicalName, deterministic.contract)),
        ),
    );
    const contract = raceFirstWriteWith(
      deterministic.contract,
      competing.snapshot(),
      'updated',
    );

    const outcome = await Effect.runPromise(
      current
        .verifySnapshot()
        .pipe(
          Effect.result,
          Effect.provide(contractLayer(logicalName, contract)),
        ),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(SnapshotIncompatible);
    }
    const stored = await Effect.runPromise(
      deterministic.contract.getItem(TABLE_STATE_KEY, { consistent: true }),
    );
    expect(stored?.data).toEqual(competing.snapshot());
  });

  it('records a requires-backfill change as a need owed until settled, warning once', async () => {
    const logicalName = 'enforce-backfill';
    const note = EntityESchema.make('Note', 'id', {
      title: Schema.String,
      status: Schema.String,
    }).build();

    const before = StdTable.make(logicalName)
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    before
      .entity(note)
      .primary({ pk: ['title'] })
      .build();

    const after = StdTable.make(logicalName)
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    after
      .entity(note)
      .primary({ pk: ['title'] })
      .index('GSI1', 'byStatus', { pk: ['title'], sk: ['status'] })
      .build();

    const deterministic = makeDeterministicContract(logicalName);
    const contract = raceFirstWriteWith(
      deterministic.contract,
      before.snapshot(),
      'updated',
    );
    const layer = contractLayer(logicalName, contract);
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

    const state = await Effect.runPromise(
      Effect.gen(function* () {
        yield* before.verifySnapshot();
        yield* after.verifySnapshot();
        yield* after.verifySnapshot();
        return yield* after.state();
      }).pipe(Effect.provide(layer), Effect.provide(Logger.layer([collector]))),
    );

    // The competing write forces one retry, which re-diffs and re-warns; the
    // third verify matches and stays silent.
    expect(
      warnings.filter((message) => message.includes('backfill')),
    ).toHaveLength(2);
    expect(state.snapshot).toEqual(after.snapshot());
    expect(state.backfill).toHaveLength(1);
    expect(state.backfill[0]?.subject).toEqual({
      kind: 'access-pattern',
      owner: 'Note',
      name: 'byStatus',
    });
    expect(state.backfill[0]?.since).toBeTruthy();
  });

  it('rejects a breaking change and leaves the baseline untouched', async () => {
    const logicalName = 'enforce-breaking';
    const before = StdTable.make(logicalName).primary('pk', 'sk').build();
    const after = StdTable.make(logicalName)
      .primary('partitionKey', 'sortKey')
      .build();

    const deterministic = makeDeterministicContract(logicalName);
    const layer = contractLayer(logicalName, deterministic.contract);

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        yield* before.verifySnapshot();
        const result = yield* after.verifySnapshot().pipe(Effect.result);
        // The baseline is still "before": re-verifying it must still match.
        yield* before.verifySnapshot();
        return result;
      }).pipe(Effect.provide(layer)),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(SnapshotIncompatible);
    }
  });

  it('reads a baseline stored before epochs existed, then restamps it with them', async () => {
    const logicalName = 'enforce-legacy';
    const note = EntityESchema.make('Note', 'id', {
      title: Schema.String,
    }).build();
    const table = StdTable.make(logicalName).primary('pk', 'sk').build();
    table
      .entity(note)
      .primary({ pk: ['title'] })
      .build();

    const deterministic = makeDeterministicContract(logicalName);
    await Effect.runPromise(
      deterministic.contract.writeItem({
        item: {
          pk: TABLE_STATE_KEY.pk,
          sk: TABLE_STATE_KEY.sk,
          meta: { _e: '__std_toolkit_enforcement__', _u: 'legacy', _d: false },
          data: table.snapshot() as unknown as EncodedData,
          keys: {},
        },
      }),
    );
    const layer = contractLayer(logicalName, deterministic.contract);

    const read = await Effect.runPromise(
      table.state().pipe(Effect.provide(layer)),
    );
    expect(read.snapshot).toEqual(table.snapshot());
    expect(read.entities).toEqual({});

    await Effect.runPromise(table.verifySnapshot().pipe(Effect.provide(layer)));
    const stored = await storedState(deterministic.contract);
    expect(stored?._v).toBe('v1');
    expect(stored?.snapshot).toEqual(table.snapshot());
    expect(stored?.entities['Note']?.epoch).toBeTruthy();
  });

  it('never surfaces the reserved state item through scan', async () => {
    const logicalName = 'enforce-scan-invisible';
    const note = EntityESchema.make('Note', 'id', {
      title: Schema.String,
    }).build();
    const table = StdTable.make(logicalName).primary('pk', 'sk').build();
    const noteEntity = table
      .entity(note)
      .primary({ pk: ['title'] })
      .build();

    const deterministic = makeDeterministicContract(logicalName);
    const layer = contractLayer(logicalName, deterministic.contract);

    const items = await Effect.runPromise(
      Effect.gen(function* () {
        yield* table.verifySnapshot();
        yield* noteEntity.insert({ id: 'n1', title: 'hello' });
        return Array.from(yield* Stream.runCollect(table.scan()));
      }).pipe(Effect.provide(layer)),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.meta._e).toBe('Note');
  });
});
