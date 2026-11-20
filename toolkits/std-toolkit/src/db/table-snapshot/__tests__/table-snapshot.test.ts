import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import { TableSnapshot } from '../../../snapshot/index.js';
import { makeTableContract } from '../../memory/table/index.js';
import {
  ConditionFailure,
  OperationFailure,
  contractLayer,
  type ConditionalPut,
  type StdTableContract,
  type StoredItem,
} from '../../std-table/contract/index.js';
import { StdTable } from '../../std-table/table/index.js';
import {
  checkTableSnapshot,
  decodeStoredSnapshot,
  joinTableSnapshot,
  readStoredSnapshot,
  SetupRefused,
  splitTableSnapshot,
  type BackfillChoice,
  type TableMode,
  type TableSnapshotPlan,
} from '../index.js';

// ─── The code, at each release ──────────────────────────────────────────────

interface Release {
  /** Note v1's title: its checks are part of the stored snapshot. */
  readonly title?: Schema.Codec<string, string>;
  /** Note gains a v2 with a body. */
  readonly noteV2?: boolean;
  /** A Tag entity joins the table. */
  readonly tag?: boolean;
  /** Note is queried by title, a change rows owe a backfill. */
  readonly byTitle?: boolean;
  /** Note v1's title becomes a number: a breaking edit. */
  readonly breaking?: boolean;
  /** The table gains GSI2, and Note a pattern on it. */
  readonly gsi2?: boolean;
  /** Note gains a v2 with a field of the nested ESchema Zed. */
  readonly zed?: boolean;
}

const Zed = ESchema.make('Zed', { value: Schema.String }).build();

const makeTable = (release: Release = {}) => {
  const indexes = StdTable.make('notes')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK');
  const withGSI2 = indexes.gsi('GSI2', 'GSI2PK', 'GSI2SK');
  // Typed with GSI2 either way: a pattern names it only when the table has it.
  const table = (release.gsi2 ? withGSI2 : indexes).build() as ReturnType<
    typeof withGSI2.build
  >;
  const v1 = EntityESchema.make('Note', 'noteId', {
    title: release.breaking
      ? (Schema.Finite as unknown as Schema.Codec<string, string>)
      : (release.title ?? Schema.String.check(Schema.isMaxLength(10))),
  });
  const Note = release.zed
    ? v1
        .evolve('v2', { zed: Zed.schema }, (previous) => ({
          ...previous,
          zed: { value: '' },
        }))
        .build()
    : release.noteV2
      ? v1
          .evolve('v2', { body: Schema.String }, (previous) => ({
            ...previous,
            body: '',
          }))
          .build()
      : v1.build();
  let note = table.entity(Note).primary();
  if (release.byTitle) note = note.index('GSI1', 'byTitle', { pk: ['title'] });
  if (release.gsi2) note = note.index('GSI2', 'byTitle2', { pk: ['title'] });
  note.build();
  if (release.tag)
    table
      .entity(
        EntityESchema.make('Tag', 'tagId', { label: Schema.String }).build(),
      )
      .primary()
      .build();
  return table;
};

const v1 = makeTable();

// ─── A physical table, watched ──────────────────────────────────────────────

interface Physical {
  readonly items: Map<string, StoredItem>;
  readonly contract: StdTableContract;
  /** Every write and wipe, in order: `<_e> <sk>` or `wipe`. */
  readonly log: string[];
}

const physical = (): Physical => {
  const items = new Map<string, StoredItem>();
  const raw = makeTableContract(v1, items);
  const log: string[] = [];
  const contract: StdTableContract = {
    ...raw,
    writeItem: (put) =>
      raw
        .writeItem(put)
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => log.push(`${put.item.meta._e} ${put.item.sk}`)),
          ),
        ),
  };
  return { items, contract, log };
};

const check = (
  table: Physical,
  code: ReturnType<typeof makeTable>,
  mode: TableMode,
  options: {
    readonly contract?: StdTableContract;
    readonly backfill?: BackfillChoice | 'keep';
  } = {},
): Promise<TableSnapshotPlan> =>
  Effect.runPromise(
    checkTableSnapshot({
      contract: options.contract ?? table.contract,
      snapshot: TableSnapshot.capture(code),
      mode,
      wipe: () =>
        Effect.suspend(() => {
          table.log.push('wipe');
          // As SQLite drops the table: the internal items go too.
          table.items.clear();
          return Effect.void;
        }),
      ...(options.backfill === undefined ? {} : { backfill: options.backfill }),
    }),
  );

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected the check to refuse');
    },
    (cause: unknown) => {
      expect(cause).toBeInstanceOf(SetupRefused);
      return cause as SetupRefused;
    },
  );

/** The snapshot the table keeps, joined back from its items. */
const stored = async (table: Physical) => {
  const values = await Effect.runPromise(
    readStoredSnapshot(table.contract).pipe(
      Effect.flatMap(decodeStoredSnapshot),
    ),
  );
  if (values === undefined) return undefined;
  return Effect.runPromise(joinTableSnapshot(values));
};

const snapshotOf = (code: ReturnType<typeof makeTable>, mode: TableMode) => ({
  snapshot: TableSnapshot.capture(code),
  mode,
  localIndexOrder: [],
});

const insertNote = (table: Physical) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const Note = EntityESchema.make('Note', 'noteId', {
        title: Schema.String,
      }).build();
      const code = StdTable.make('notes').primary('pk', 'sk').build();
      const note = code.entity(Note).primary().build();
      yield* note.insert({ noteId: 'n1', title: 'kept' });
    }).pipe(Effect.provide(contractLayer('notes', table.contract))),
  );

const appRows = (table: Physical) =>
  [...table.items.values()].filter((item) => !item.meta._e.startsWith('__'));

// ─── The internal entities ──────────────────────────────────────────────────

describe('the internal entities', () => {
  it('are registered first in every table, and in its snapshot', () => {
    expect(v1.registeredEntities.map(({ name }) => name)).toEqual([
      '__snapshot',
      '__snapshot_entity',
      '__snapshot_version',
      'Note',
    ]);
    const snapshot = TableSnapshot.capture(v1);
    expect(snapshot.entities.map(({ name }) => name)).toEqual([
      'Note',
      '__snapshot',
      '__snapshot_entity',
      '__snapshot_version',
    ]);
    expect(snapshot.schemas.map(({ identity }) => identity)).toEqual([
      'Note',
      '__snapshot',
      '__snapshot_entity',
      '__snapshot_version',
    ]);
  });

  it('reserve names starting with "__" to std-toolkit', () => {
    const table = StdTable.make('reserved').primary('pk', 'sk').build();
    const keyed = EntityESchema.make('__x', 'id', { a: Schema.String }).build();
    expect(() => table.entity(keyed).primary().build()).toThrow(
      /"__x" is reserved/,
    );
    const single = ESchema.make('__y', { a: Schema.String }).build();
    expect(() => table.singleEntity(single).default({ a: '' })).toThrow(
      /"__y" is reserved/,
    );
  });

  it('are stored as real items, themselves included, and read back through their ESchemas', async () => {
    const table = physical();
    await check(table, v1, 'persistent');
    const items = [...table.items.values()];
    expect(new Set(items.map(({ meta }) => meta._e))).toEqual(
      new Set(['__snapshot', '__snapshot_entity', '__snapshot_version']),
    );
    for (const item of items) {
      expect(item.meta._u).not.toBe('');
      expect(item.data._v).toBe('v1');
    }
    const entitySks = items
      .filter(({ meta }) => meta._e === '__snapshot_entity')
      .map(({ sk }) => sk)
      .sort();
    expect(entitySks).toEqual([
      'Note',
      '__snapshot',
      '__snapshot_entity',
      '__snapshot_version',
    ]);
    const versionSks = items
      .filter(({ meta }) => meta._e === '__snapshot_version')
      .map(({ sk }) => sk);
    expect(versionSks).toContain('__snapshot_version@v1');
    expect(await stored(table)).toEqual(snapshotOf(v1, 'persistent'));
  });
});

// ─── Split and join ─────────────────────────────────────────────────────────

describe('split and join', () => {
  const code = TableSnapshot.capture(makeTable({ noteV2: true, tag: true }));

  it('round-trip a table snapshot and its mode', async () => {
    const values = splitTableSnapshot(code, 'disposable');
    expect(values.snapshot.mode).toBe('disposable');
    expect(
      values.versions
        .filter(({ schema }) => schema === 'Note')
        .map(({ id, position }) => [id, position]),
    ).toEqual([
      ['Note@v1', 0],
      ['Note@v2', 1],
    ]);
    expect(await Effect.runPromise(joinTableSnapshot(values))).toEqual({
      snapshot: code,
      mode: 'disposable',
      localIndexOrder: [],
    });
  });

  it('keeps the local secondary indexes in declared order, which the snapshot sorts by name', async () => {
    const table = StdTable.make('notes')
      .primary('pk', 'sk')
      .lsi('LSI2', 'LSI2SK')
      .lsi('LSI1', 'LSI1SK')
      .build();
    const snapshot = TableSnapshot.capture(table);
    const declared = Object.keys(table.localSecondaryIndexes);
    expect(declared).toEqual(['LSI2', 'LSI1']);
    expect(
      snapshot.topology.localSecondaryIndexes.map(({ name }) => name),
    ).toEqual(['LSI1', 'LSI2']);

    const values = splitTableSnapshot(snapshot, 'persistent', declared);
    expect(
      values.snapshot.localSecondaryIndexes.map(({ name }) => name),
    ).toEqual(['LSI2', 'LSI1']);
    expect(await Effect.runPromise(joinTableSnapshot(values))).toEqual({
      snapshot,
      mode: 'persistent',
      localIndexOrder: ['LSI2', 'LSI1'],
    });
    expect(
      splitTableSnapshot(snapshot, 'persistent').snapshot.localSecondaryIndexes,
    ).toEqual(snapshot.topology.localSecondaryIndexes);
  });

  it('orders versions by position, not by the order they are read in', async () => {
    const values = splitTableSnapshot(code, 'persistent');
    const shuffled = { ...values, versions: [...values.versions].reverse() };
    expect(
      (await Effect.runPromise(joinTableSnapshot(shuffled))).snapshot,
    ).toEqual(code);
  });

  it('refuses version items of one schema that disagree on its kind or id field', async () => {
    const values = splitTableSnapshot(code, 'persistent');
    const versions = values.versions.map((version) =>
      version.id === 'Note@v2' ? { ...version, idField: 'other' } : version,
    );
    await expect(
      Effect.runPromise(joinTableSnapshot({ ...values, versions })),
    ).rejects.toThrow(/disagree on its kind or id field/);
  });

  it('refuses a version list with a gap', async () => {
    const values = splitTableSnapshot(code, 'persistent');
    const versions = values.versions.filter(({ id }) => id !== 'Note@v1');
    await expect(
      Effect.runPromise(joinTableSnapshot({ ...values, versions })),
    ).rejects.toThrow(/without a gap/);
  });
});

// ─── The check ──────────────────────────────────────────────────────────────

describe('checkTableSnapshot', () => {
  it('records the first snapshot of an empty table, with __snapshot last', async () => {
    const table = physical();
    expect(await check(table, v1, 'persistent')).toEqual({
      kind: 'first',
      adopted: false,
    });
    expect(table.log.at(-1)).toBe('__snapshot single');
    expect(table.log.filter((line) => line.startsWith('__snapshot '))).toEqual([
      '__snapshot single',
    ]);
    expect(await stored(table)).toEqual(snapshotOf(v1, 'persistent'));
  });

  it('writes nothing when nothing changed', async () => {
    const table = physical();
    await check(table, v1, 'persistent');
    table.log.length = 0;
    expect(await check(table, makeTable(), 'persistent')).toEqual({
      kind: 'unchanged',
    });
    expect(table.log).toEqual([]);
  });

  it('passes an additive change and writes only the new items', async () => {
    const table = physical();
    await check(table, v1, 'persistent');
    table.log.length = 0;
    const next = makeTable({ noteV2: true, tag: true });
    expect(await check(table, next, 'persistent')).toEqual({
      kind: 'apply',
      backfill: [],
    });
    expect(table.log.sort()).toEqual([
      '__snapshot_entity Tag',
      '__snapshot_version Note@v2',
      '__snapshot_version Tag@v1',
    ]);
    expect(await stored(table)).toEqual(snapshotOf(next, 'persistent'));
  });

  it('rewrites the one version item whose check was loosened', async () => {
    const table = physical();
    await check(table, v1, 'persistent');
    table.log.length = 0;
    const loosened = makeTable({
      title: Schema.String.check(Schema.isMaxLength(20)),
    });
    expect(await check(table, loosened, 'persistent')).toEqual({
      kind: 'apply',
      backfill: [],
    });
    expect(table.log).toEqual(['__snapshot_version Note@v1']);
  });

  it('refuses a breaking change to a persistent table and writes nothing', async () => {
    const table = physical();
    await check(table, v1, 'persistent');
    const before = structuredClone([...table.items.entries()]);
    table.log.length = 0;
    const refused = await refusal(
      check(table, makeTable({ breaking: true }), 'persistent'),
    );
    expect(refused.reason).toBe('breaking');
    expect(refused.message).toMatch(/Nothing was changed/);
    expect(table.log).toEqual([]);
    expect([...table.items.entries()]).toEqual(before);
  });

  it('refuses a persistent table becoming disposable', async () => {
    const table = physical();
    await check(table, v1, 'persistent');
    table.log.length = 0;
    expect((await refusal(check(table, v1, 'disposable'))).reason).toBe(
      'mode-change',
    );
    expect(table.log).toEqual([]);
  });

  it('wipes a disposable table on a breaking change before writing anything', async () => {
    const table = physical();
    await check(table, v1, 'disposable');
    await insertNote(table);
    table.log.length = 0;
    const next = makeTable({ breaking: true });
    const plan = await check(table, next, 'disposable');
    expect(plan.kind).toBe('wipe');
    expect(table.log[0]).toBe('wipe');
    expect(table.log.at(-1)).toBe('__snapshot single');
    expect(appRows(table)).toEqual([]);
    expect(await stored(table)).toEqual(snapshotOf(next, 'disposable'));
  });

  it('treats data written while disposable as disposable, even as the table becomes persistent', async () => {
    const table = physical();
    await check(table, v1, 'disposable');
    const next = makeTable({ breaking: true });
    expect((await check(table, next, 'persistent')).kind).toBe('wipe');
    expect(await stored(table)).toEqual(snapshotOf(next, 'persistent'));
    // From here on, it is persistent.
    expect(
      (await refusal(check(table, makeTable(), 'persistent'))).reason,
    ).toBe('breaking');
  });

  describe('a change that needs a backfill', () => {
    const next = makeTable({ byTitle: true });

    it('passes on a persistent table, listing what is owed', async () => {
      const table = physical();
      await check(table, v1, 'persistent');
      const plan = await check(table, next, 'persistent');
      expect(plan.kind).toBe('apply');
      expect(plan.kind === 'apply' && plan.backfill.length).toBe(1);
      expect(table.log).not.toContain('wipe');
    });

    it('wipes a disposable table by default, and applies with reindex', async () => {
      const wiped = physical();
      await check(wiped, v1, 'disposable');
      expect((await check(wiped, next, 'disposable')).kind).toBe('wipe');

      const reindexed = physical();
      await check(reindexed, v1, 'disposable');
      const plan = await check(reindexed, next, 'disposable', {
        backfill: 'reindex',
      });
      expect(plan.kind).toBe('apply');
      expect(reindexed.log).not.toContain('wipe');
    });
  });

  describe('a table with rows but no snapshot', () => {
    it('keeps its rows when persistent', async () => {
      const table = physical();
      await insertNote(table);
      expect(await check(table, v1, 'persistent')).toEqual({
        kind: 'first',
        adopted: true,
      });
      expect(appRows(table)).toHaveLength(1);
      expect(table.log).not.toContain('wipe');
    });

    it('is wiped when disposable', async () => {
      const table = physical();
      await insertNote(table);
      table.log.length = 0;
      expect(await check(table, v1, 'disposable')).toEqual({
        kind: 'wipe',
        changes: [],
      });
      expect(table.log[0]).toBe('wipe');
      expect(appRows(table)).toEqual([]);
      expect(await stored(table)).toEqual(snapshotOf(v1, 'disposable'));
    });
  });

  describe('a stored snapshot that does not read', () => {
    const corrupt = (table: Physical) => {
      for (const [key, item] of table.items)
        if (item.sk === 'Note@v1')
          table.items.set(key, { ...item, data: { _v: 'v1', id: 7 } });
    };

    it('is refused on a persistent table', async () => {
      const table = physical();
      await check(table, v1, 'persistent');
      corrupt(table);
      expect((await refusal(check(table, v1, 'persistent'))).reason).toBe(
        'unreadable',
      );
    });

    it('is wiped on a disposable one', async () => {
      const table = physical();
      await check(table, v1, 'disposable');
      corrupt(table);
      expect(await check(table, v1, 'disposable')).toEqual({
        kind: 'wipe',
        changes: [],
      });
      expect(await stored(table)).toEqual(snapshotOf(v1, 'disposable'));
    });
  });

  describe('setups that race', () => {
    /** A contract whose first write waits for another setup to run to the end. */
    const racedBy = (table: Physical, other: ReturnType<typeof makeTable>) => {
      let raced = false;
      const failures = { count: 0 };
      const contract: StdTableContract = {
        ...table.contract,
        writeItem: (put: ConditionalPut) =>
          Effect.gen(function* () {
            if (!raced) {
              raced = true;
              yield* Effect.promise(() => check(table, other, 'persistent'));
            }
            return yield* table.contract.writeItem(put);
          }).pipe(
            Effect.tapError((error) =>
              Effect.sync(() => {
                if (error instanceof ConditionFailure) failures.count++;
              }),
            ),
          ),
      };
      return { contract, failures };
    };

    it('leave the items another setup of the same code wrote first', async () => {
      const table = physical();
      const next = makeTable({ noteV2: true });
      const { contract, failures } = racedBy(table, next);

      expect(await check(table, next, 'persistent', { contract })).toEqual({
        kind: 'first',
        adopted: false,
      });
      expect(failures.count).toBeGreaterThan(0);
      expect(await stored(table)).toEqual(snapshotOf(next, 'persistent'));
    });

    it('start over from the read when another setup wrote a snapshot this one never read', async () => {
      const table = physical();
      // The other setup runs newer code: Note gains a v2 this one lacks. Every
      // item this one writes matches one of the other's, but v2 is extra.
      const { contract } = racedBy(table, makeTable({ noteV2: true }));

      const refused = await refusal(
        check(table, v1, 'persistent', { contract }),
      );

      expect(refused.reason).toBe('breaking');
      expect(await stored(table)).toEqual(
        snapshotOf(makeTable({ noteV2: true }), 'persistent'),
      );
    });

    it('gives up after starting over three times', async () => {
      const table = physical();
      let attempts = 0;
      const losing: StdTableContract = {
        ...table.contract,
        writeItem: () =>
          Effect.sync(() => attempts++).pipe(
            Effect.andThen(Effect.fail(new ConditionFailure({}))),
          ),
      };
      await expect(
        check(table, v1, 'persistent', { contract: losing }),
      ).rejects.toBeInstanceOf(ConditionFailure);
      expect(attempts).toBe(4);
    });
  });

  describe('a setup stopped midway', () => {
    /** A contract that fails every write after the first `writes`. */
    const failingAfter = (
      table: Physical,
      writes: number,
    ): StdTableContract => {
      let done = 0;
      return {
        ...table.contract,
        writeItem: (put) =>
          done++ < writes
            ? table.contract.writeItem(put)
            : Effect.fail(new OperationFailure({ cause: 'stopped' })),
      };
    };

    const totalWrites = async (prepare: (table: Physical) => Promise<void>) => {
      const table = physical();
      await prepare(table);
      table.log.length = 0;
      return table;
    };

    const cases: readonly {
      readonly name: string;
      readonly mode: TableMode;
      readonly prepare: (table: Physical) => Promise<void>;
      readonly next: ReturnType<typeof makeTable>;
    }[] = [
      {
        name: 'on its first run',
        mode: 'persistent',
        prepare: async () => {},
        next: v1,
      },
      {
        name: 'on its first run, with a nested ESchema and an index',
        mode: 'persistent',
        prepare: async () => {},
        next: makeTable({ zed: true, gsi2: true }),
      },
      {
        name: 'taking an additive change',
        mode: 'persistent',
        prepare: async (table) => {
          await check(table, v1, 'persistent');
        },
        next: makeTable({ noteV2: true, tag: true, byTitle: true }),
      },
      {
        name: 'after wiping a disposable table',
        mode: 'disposable',
        prepare: async (table) => {
          await check(table, v1, 'disposable');
        },
        next: makeTable({ breaking: true, tag: true }),
      },
    ];

    for (const { name, mode, prepare, next } of cases)
      it(`leaves a state the next run accepts, ${name}`, async () => {
        const reference = await totalWrites(prepare);
        await check(reference, next, mode);
        const writes = reference.log.filter((line) => line !== 'wipe').length;
        expect(writes).toBeGreaterThan(1);
        for (let stopAfter = 0; stopAfter < writes; stopAfter++) {
          const table = await totalWrites(prepare);
          await expect(
            check(table, next, mode, {
              contract: failingAfter(table, stopAfter),
            }),
          ).rejects.toBeInstanceOf(OperationFailure);
          await check(table, next, mode);
          expect(await stored(table)).toEqual(snapshotOf(next, mode));
          expect(await check(table, next, mode)).toEqual({
            kind: 'unchanged',
          });
        }
      });

    describe('on its first run, before __snapshot', () => {
      /** A first run stopped just before its last write, `__snapshot`. */
      const withoutSnapshot = async (mode: TableMode) => {
        const reference = physical();
        await check(reference, v1, mode);
        const table = physical();
        await check(table, v1, mode, {
          contract: failingAfter(table, reference.log.length - 1),
        }).catch(() => {});
        expect(table.log.at(-1)).not.toBe('__snapshot single');
        expect(table.items.size).toBeGreaterThan(0);
        table.log.length = 0;
        return table;
      };

      it('leaves items the next run checks against, refusing a breaking change', async () => {
        const table = await withoutSnapshot('persistent');
        const refused = await refusal(
          check(table, makeTable({ breaking: true }), 'persistent'),
        );
        expect(refused.reason).toBe('breaking');
        expect(table.log).toEqual([]);

        expect(await check(table, v1, 'persistent')).toEqual({
          kind: 'apply',
          backfill: [],
        });
        expect(table.log).toEqual(['__snapshot single']);
        expect(await stored(table)).toEqual(snapshotOf(v1, 'persistent'));
      });

      it('takes the data as persistent, so a disposable table is neither wiped nor refused its own mode', async () => {
        const table = await withoutSnapshot('disposable');
        const refused = await refusal(
          check(table, makeTable({ breaking: true }), 'disposable'),
        );
        expect(refused.reason).toBe('breaking');
        expect(table.log).toEqual([]);

        await check(table, v1, 'disposable');
        expect(table.log).not.toContain('wipe');
        expect(await stored(table)).toEqual(snapshotOf(v1, 'disposable'));
      });
    });

    // Every prefix of the writes must join into a stored snapshot that is a
    // baseline for the next setup, whether it runs the same code or the code
    // from before.
    const transitions: readonly {
      readonly name: string;
      readonly previous: ReturnType<typeof makeTable>;
      readonly next: ReturnType<typeof makeTable>;
    }[] = [
      {
        name: 'adding a global secondary index and a pattern on it',
        previous: makeTable(),
        next: makeTable({ gsi2: true }),
      },
      {
        name: 'adding a version that names a new nested ESchema',
        previous: makeTable(),
        next: makeTable({ zed: true }),
      },
      {
        name: "removing an index's last pattern, then the index",
        previous: makeTable({ gsi2: true }),
        next: makeTable(),
      },
    ];

    /** A table set up under `previous`, then stopped after `writes` of `next`'s. */
    const stoppedAt = async (
      previous: ReturnType<typeof makeTable>,
      next: ReturnType<typeof makeTable>,
      mode: TableMode,
      writes: number,
    ) => {
      const table = physical();
      await check(table, previous, mode, reindexed);
      table.log.length = 0;
      await check(table, next, mode, {
        ...reindexed,
        contract: failingAfter(table, writes),
      }).catch((cause: unknown) => {
        expect(cause).toBeInstanceOf(OperationFailure);
      });
      return table;
    };

    // A disposable table reindexes, as IndexedDB does, so a new pattern
    // applies in either mode rather than wiping.
    const reindexed = { backfill: 'reindex' } as const;

    for (const mode of ['persistent', 'disposable'] as const)
      for (const { name, previous, next } of transitions)
        it(`leaves a readable baseline after every write, ${name}, ${mode}`, async () => {
          const reference = physical();
          await check(reference, previous, mode, reindexed);
          reference.log.length = 0;
          await check(reference, next, mode, reindexed);
          const total = reference.log.length;
          expect(total).toBeGreaterThan(1);

          for (let writes = 1; writes <= total; writes++) {
            const same = await stoppedAt(previous, next, mode, writes);
            await check(same, next, mode, reindexed);
            expect(same.log).not.toContain('wipe');
            expect(await stored(same)).toEqual(snapshotOf(next, mode));

            const reverted = await stoppedAt(previous, next, mode, writes);
            const outcome = await check(
              reverted,
              previous,
              mode,
              reindexed,
            ).then(
              (plan) => plan.kind,
              (cause: unknown) => {
                expect(cause).toBeInstanceOf(SetupRefused);
                return (cause as SetupRefused).reason;
              },
            );
            // The previous code passes, or is refused (or, disposable, wiped)
            // for what the stopped setup already recorded; never for a
            // snapshot it cannot read.
            expect(
              mode === 'persistent'
                ? ['apply', 'unchanged', 'breaking']
                : ['apply', 'unchanged', 'wipe'],
            ).toContain(outcome);
            if (outcome !== 'breaking')
              expect(await stored(reverted)).toEqual(
                snapshotOf(previous, mode),
              );
            await check(reverted, next, mode, reindexed);
            expect(await stored(reverted)).toEqual(snapshotOf(next, mode));
          }
        });
  });
});
