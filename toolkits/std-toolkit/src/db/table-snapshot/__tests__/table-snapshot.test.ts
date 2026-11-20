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
  captureTable,
  checkTableSnapshot,
  decodeStoredSnapshot,
  joinTableSnapshot,
  readStoredSnapshot,
  SetupRefused,
  snapshotHash,
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

const hashOf = (
  snapshot: TableSnapshot,
  localIndexOrder: readonly string[] = [],
) => Effect.runPromise(snapshotHash(snapshot, localIndexOrder));

/** The hash `__snapshot` holds; `undefined` when none is stored. */
const storedHash = (table: Physical) =>
  [...table.items.values()].find(({ meta }) => meta._e === '__snapshot')?.data
    .hash;

/**
 * The invariant the fast path rests on: `__snapshot` holds a hash only when
 * every stored item is as the code with that hash has it.
 */
const expectHashHolds = async (table: Physical) => {
  const hash = storedHash(table);
  if (hash === undefined || hash === null) return;
  const joined = await stored(table);
  expect(joined).toBeDefined();
  expect(hash).toBe(await hashOf(joined!.snapshot, joined!.localIndexOrder));
  const values = splitTableSnapshot(
    joined!.snapshot,
    joined!.mode,
    joined!.localIndexOrder,
  );
  // Every live item, not just what joins: nothing is left over.
  const live = [...table.items.values()].filter(
    ({ meta }) => !meta._d && meta._e.startsWith('__snapshot_'),
  );
  expect(live).toHaveLength(values.entities.length + values.versions.length);
};

/** The table's contract, counting its reads. */
const counted = (table: Physical) => {
  const reads = { getItem: 0, queryItems: 0, scanItems: 0 };
  const contract: StdTableContract = {
    ...table.contract,
    getItem: (key, options) => {
      reads.getItem++;
      return table.contract.getItem(key, options);
    },
    queryItems: (query) => {
      reads.queryItems++;
      return table.contract.queryItems(query);
    },
    scanItems: (scan) => {
      reads.scanItems++;
      return table.contract.scanItems(scan);
    },
  };
  return { contract, reads };
};

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

// ─── The snapshot hash ──────────────────────────────────────────────────────

describe('the snapshot hash', () => {
  it('is the same for the same table, built apart, in any registration order', async () => {
    const one = StdTable.make('notes').primary('pk', 'sk').build();
    const two = StdTable.make('notes').primary('pk', 'sk').build();
    const Note = EntityESchema.make('Note', 'noteId', {
      title: Schema.String,
    }).build();
    const Tag = EntityESchema.make('Tag', 'tagId', {
      label: Schema.String,
    }).build();
    one.entity(Note).primary().build();
    one.entity(Tag).primary().build();
    two.entity(Tag).primary().build();
    two.entity(Note).primary().build();
    const hash = await hashOf(TableSnapshot.capture(one));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashOf(TableSnapshot.capture(two))).toBe(hash);
  });

  it('is the same for a snapshot serialized and parsed back, as a deploy carries it', async () => {
    const snapshot = TableSnapshot.capture(makeTable({ zed: true }));
    const carried = await Effect.runPromise(
      TableSnapshot.serialize(snapshot).pipe(
        Effect.map((encoded) => JSON.parse(JSON.stringify(encoded)) as unknown),
        Effect.flatMap(TableSnapshot.parse),
      ),
    );
    expect(carried).not.toBe(snapshot);
    expect(await hashOf(carried)).toBe(await hashOf(snapshot));
  });

  it('differs when anything the check compares differs', async () => {
    const lsis = (order: readonly ['LSI1' | 'LSI2', 'LSI1' | 'LSI2']) => {
      const builder = StdTable.make('notes').primary('pk', 'sk');
      return TableSnapshot.capture(
        builder
          .lsi(order[0], `${order[0]}SK`)
          .lsi(order[1], `${order[1]}SK`)
          .build(),
      );
    };
    const hashes = [
      await hashOf(TableSnapshot.capture(v1)),
      // A version's shape: a check loosened.
      await hashOf(
        TableSnapshot.capture(
          makeTable({ title: Schema.String.check(Schema.isMaxLength(20)) }),
        ),
      ),
      // A new version.
      await hashOf(TableSnapshot.capture(makeTable({ noteV2: true }))),
      // An access pattern.
      await hashOf(TableSnapshot.capture(makeTable({ byTitle: true }))),
      // An index.
      await hashOf(TableSnapshot.capture(makeTable({ gsi2: true }))),
      // An entity.
      await hashOf(TableSnapshot.capture(makeTable({ tag: true }))),
      // The order the local secondary indexes are declared in.
      await hashOf(lsis(['LSI1', 'LSI2']), ['LSI1', 'LSI2']),
      await hashOf(lsis(['LSI2', 'LSI1']), ['LSI2', 'LSI1']),
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
    // The snapshot alone sorts the indexes by name; only the order differs.
    expect(lsis(['LSI2', 'LSI1'])).toEqual(lsis(['LSI1', 'LSI2']));
  });

  it('is captured again once an entity registers after the table is built', () => {
    const table = StdTable.make('later').primary('pk', 'sk').build();
    const first = captureTable(table);
    expect(captureTable(table)).toBe(first);
    table
      .entity(EntityESchema.make('Late', 'id', { a: Schema.String }).build())
      .primary()
      .build();
    const second = captureTable(table);
    expect(second).not.toBe(first);
    expect(second.entities.map(({ name }) => name)).toContain('Late');
    expect(second).toEqual(TableSnapshot.capture(table));
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

  describe('on its hash', () => {
    it("records the code's hash with the first snapshot", async () => {
      const table = physical();
      await check(table, v1, 'persistent');
      expect(storedHash(table)).toBe(await hashOf(TableSnapshot.capture(v1)));
      await expectHashHolds(table);
    });

    it('takes an unchanged table on one read of __snapshot, and writes nothing', async () => {
      const table = physical();
      await check(table, v1, 'persistent');
      table.log.length = 0;
      const { contract, reads } = counted(table);
      expect(
        await check(table, makeTable(), 'persistent', { contract }),
      ).toEqual({
        kind: 'unchanged',
      });
      expect(reads).toEqual({ getItem: 1, queryItems: 0, scanItems: 0 });
      expect(table.log).toEqual([]);
    });

    it('checks a changed table in full and records its new hash, so the next setup takes one read', async () => {
      const table = physical();
      await check(table, v1, 'persistent');
      const next = makeTable({ noteV2: true, tag: true });
      const changed = counted(table);
      await check(table, next, 'persistent', { contract: changed.contract });
      expect(changed.reads.queryItems).toBeGreaterThan(0);
      expect(storedHash(table)).toBe(await hashOf(TableSnapshot.capture(next)));
      await expectHashHolds(table);

      const again = counted(table);
      await check(table, next, 'persistent', { contract: again.contract });
      expect(again.reads).toEqual({ getItem: 1, queryItems: 0, scanItems: 0 });
    });

    it('records a missing or stale hash on a full check that finds nothing changed, in one write', async () => {
      for (const hash of [null, 'stale']) {
        const table = physical();
        await check(table, v1, 'persistent');
        for (const [key, item] of table.items)
          if (item.meta._e === '__snapshot')
            table.items.set(key, { ...item, data: { ...item.data, hash } });
        table.log.length = 0;
        const { contract, reads } = counted(table);
        expect(await check(table, v1, 'persistent', { contract })).toEqual({
          kind: 'unchanged',
        });
        expect(reads.queryItems).toBeGreaterThan(0);
        expect(table.log).toEqual(['__snapshot single']);
        expect(storedHash(table)).toBe(await hashOf(TableSnapshot.capture(v1)));
      }
    });

    it('checks in full when the mode differs, though the hash is equal', async () => {
      const table = physical();
      await check(table, v1, 'persistent');
      const persistent = counted(table);
      expect(
        (await refusal(check(table, v1, 'disposable', persistent))).reason,
      ).toBe('mode-change');
      expect(persistent.reads.queryItems).toBeGreaterThan(0);

      const disposable = physical();
      await check(disposable, v1, 'disposable');
      disposable.log.length = 0;
      expect(await check(disposable, v1, 'persistent')).toEqual({
        kind: 'apply',
        backfill: [],
      });
      expect(disposable.log).toEqual(['__snapshot single']);
      const { contract, reads } = counted(disposable);
      await check(disposable, v1, 'persistent', { contract });
      expect(reads).toEqual({ getItem: 1, queryItems: 0, scanItems: 0 });
    });
  });

  it('passes an additive change and writes only the new items, between unsetting and recording the hash', async () => {
    const table = physical();
    await check(table, v1, 'persistent');
    table.log.length = 0;
    const next = makeTable({ noteV2: true, tag: true });
    expect(await check(table, next, 'persistent')).toEqual({
      kind: 'apply',
      backfill: [],
    });
    expect(table.log[0]).toBe('__snapshot single');
    expect(table.log.slice(1, -1).sort()).toEqual([
      '__snapshot_entity Tag',
      '__snapshot_version Note@v2',
      '__snapshot_version Tag@v1',
    ]);
    expect(table.log.at(-1)).toBe('__snapshot single');
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
    expect(table.log).toEqual([
      '__snapshot single',
      '__snapshot_version Note@v1',
      '__snapshot single',
    ]);
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
    // As a release that stores another format would leave it: under its own
    // hash, which this code does not have.
    const corrupt = (table: Physical) => {
      for (const [key, item] of table.items) {
        if (item.sk === 'Note@v1')
          table.items.set(key, { ...item, data: { _v: 'v1', id: 7 } });
        if (item.meta._e === '__snapshot')
          table.items.set(key, {
            ...item,
            data: { ...item.data, hash: 'another release' },
          });
      }
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
          await expectHashHolds(table);
          await check(table, next, mode);
          await expectHashHolds(table);
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
            await expectHashHolds(same);
            await check(same, next, mode, reindexed);
            await expectHashHolds(same);
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
            await expectHashHolds(reverted);
            await check(reverted, next, mode, reindexed);
            await expectHashHolds(reverted);
            expect(await stored(reverted)).toEqual(snapshotOf(next, mode));
          }
        });

    it('leaves no hash after the first write of a change that adds an index, so the next setup checks in full, under either code', async () => {
      const previous = makeTable();
      const next = makeTable({ gsi2: true });
      for (const code of [previous, next]) {
        const table = await stoppedAt(previous, next, 'persistent', 1);
        expect(table.log).toEqual(['__snapshot single']);
        const [record] = [...table.items.values()].filter(
          ({ meta }) => meta._e === '__snapshot',
        );
        expect(record?.data.globalSecondaryIndexes).toContainEqual(
          expect.objectContaining({ name: 'GSI2' }),
        );
        expect(storedHash(table)).toBeNull();
        const { contract, reads } = counted(table);
        await check(table, code, 'persistent', { ...reindexed, contract });
        expect(reads.queryItems).toBeGreaterThan(0);
        expect(storedHash(table)).toBe(
          await hashOf(TableSnapshot.capture(code)),
        );
        await expectHashHolds(table);
      }
    });
  });
});
