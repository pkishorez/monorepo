import { Clock, Effect } from 'effect';
import type { AnyESchema } from '../../../eschema/index.js';
import {
  contractLayer,
  OperationFailure,
  type StdTableContract,
  type StoredItem,
  type StoredKey,
} from '../../std-table/contract/index.js';
import type { BackfillDeclaration } from '../../std-table/definition/index.js';
import {
  backfillReads,
  tableDeclaration,
  type StdTable,
} from '../../std-table/table/index.js';
import { BackfillOrderRefused, planStages, type Stage } from './plan.js';
import { BackfillFailed, backfillRow, type RowContext } from './row.js';

// The Backfill runner (ADR 0020): pending Backfills planned by `after` into
// one scan per entity stage, every row folded through each pending step and
// written once, progress kept after every page, and a Backfill done only
// once a full pass finds nothing left to rewrite.

export { BackfillFailed, BackfillOrderRefused, type Stage };

/** A Backfill's progress, as the runner reports it and resumes from. */
export interface BackfillState {
  readonly id: string;
  readonly status: 'running' | 'done';
  readonly cursor: StoredKey | null;
  readonly rowsRewritten: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

/** Orders the pending Backfills of `table` into stages, or refuses. */
export const planBackfills = (
  table: StdTable,
  pending: readonly string[],
): Effect.Effect<readonly Stage[], BackfillOrderRefused> => {
  const wanted = new Set(pending);
  return Effect.try({
    try: () =>
      planStages(
        tableDeclaration(table).backfills.filter(({ id }) => wanted.has(id)),
      ),
    catch: (error) => error as BackfillOrderRefused,
  });
};

const now = Effect.map(Clock.currentTimeMillis, (millis) =>
  new Date(millis).toISOString(),
);

const failed = (cause: unknown) =>
  cause instanceof OperationFailure ? cause : new OperationFailure({ cause });

const contextOf = (
  table: StdTable,
  store: StdTableContract,
  stages: readonly Stage[],
  index: number,
): RowContext => {
  const stage = stages[index]!;
  const declaration = tableDeclaration(table);
  const entity = declaration.entities.find(
    ({ schema }) => schema.name === stage.entity,
  );
  if (entity === undefined)
    throw new Error(`Backfill entity "${stage.entity}" is not declared`);
  const ofEntity = (backfill: BackfillDeclaration) =>
    backfill.entity === stage.entity;
  return {
    table,
    store,
    layer: contractLayer(table.logicalName, consistentReads(table, store)),
    schema: entity.schema as AnyESchema,
    entity: stage.entity,
    gaps: new Map(
      declaration.backfills
        .filter((backfill) => ofEntity(backfill) && backfill.kind === 'gap')
        .map((backfill) => [backfill.to!, backfill]),
    ),
    reindexes: stage.backfills.filter(({ kind }) => kind === 'reindex'),
    reads: backfillReads(table),
    first: stage.backfills[0]!.id,
  };
};

/**
 * The store a Backfill's `run` reads through: every get is strongly
 * consistent, and so is every query on the primary index or a local
 * secondary index, so a stage sees what an earlier one just rewrote. A
 * global secondary index cannot be read consistently on DynamoDB: a `run`
 * that depends on an entity an earlier stage rewrote should read it by
 * primary key or a local secondary index.
 */
const consistentReads = (
  table: StdTable,
  store: StdTableContract,
): StdTableContract => ({
  ...store,
  getItem: (key) => store.getItem(key, { consistent: true }),
  queryItems: (request) =>
    store.queryItems(
      request.index === undefined ||
        request.index in table.localSecondaryIndexes
        ? { ...request, consistent: true }
        : request,
    ),
});

interface Pass {
  readonly from: StoredKey | null;
  /** Called after each page with its last key and the rows it rewrote, by Backfill. */
  readonly onPage: (
    cursor: StoredKey,
    rewritten: ReadonlyMap<string, number>,
  ) => Effect.Effect<void, OperationFailure>;
}

/** Scans every row of the stage's entity once, deleted ones too; returns how many it rewrote. */
const scanPass = (
  context: RowContext,
  pageSize: number,
  pass: Pass,
): Effect.Effect<number, BackfillFailed | OperationFailure> =>
  Effect.gen(function* () {
    let cursor = pass.from;
    let total = 0;
    for (;;) {
      const page = yield* context.store
        .scanItems({
          limit: pageSize,
          // A verify pass that misses a just-written old row would mark the
          // Backfill done too early.
          consistent: true,
          ...(cursor === null ? {} : { startAfter: cursor }),
        })
        .pipe(Effect.mapError(failed));
      const rewritten = new Map<string, number>();
      for (const item of page.items as readonly StoredItem[]) {
        if (item.meta._e !== context.entity) continue;
        const ran = yield* backfillRow(context, item);
        if (ran.length > 0) total++;
        for (const id of ran) rewritten.set(id, (rewritten.get(id) ?? 0) + 1);
      }
      const last = page.items.at(-1);
      if (last !== undefined) {
        cursor = { pk: last.pk, sk: last.sk };
        yield* pass.onPage(cursor, rewritten);
      }
      if (!page.hasMore || last === undefined) return total;
    }
  });

/**
 * Runs every stage in order. A failing row fails the run with the Backfill
 * and the row it names; what was saved before stays, and nothing more is
 * marked done. Returns the final state of every Backfill it ran.
 */
export const runBackfills = (options: {
  readonly table: StdTable;
  readonly store: StdTableContract;
  readonly stages: readonly Stage[];
  readonly progress: (id: string) => BackfillState | undefined;
  readonly save: (
    states: readonly BackfillState[],
  ) => Effect.Effect<void, OperationFailure>;
  readonly pageSize: number;
}): Effect.Effect<
  readonly BackfillState[],
  BackfillFailed | OperationFailure
> =>
  Effect.gen(function* () {
    const finished: BackfillState[] = [];
    for (const [index, stage] of options.stages.entries()) {
      const context = contextOf(
        options.table,
        options.store,
        options.stages,
        index,
      );
      const startedAt = yield* now;
      const states = new Map(
        stage.backfills.map(({ id }): [string, BackfillState] => {
          const saved = options.progress(id);
          return [
            id,
            {
              id,
              status: 'running',
              cursor: saved?.status === 'running' ? saved.cursor : null,
              rowsRewritten: saved?.rowsRewritten ?? 0,
              startedAt: saved?.startedAt ?? startedAt,
              finishedAt: null,
            },
          ];
        }),
      );
      const record = (
        cursor: StoredKey | null,
        rewritten: ReadonlyMap<string, number>,
      ) => {
        for (const [id, state] of states)
          states.set(id, {
            ...state,
            cursor,
            rowsRewritten: state.rowsRewritten + (rewritten.get(id) ?? 0),
          });
      };
      // Every Backfill of a stage shares one scan, so one cursor.
      const resume = [...states.values()][0]!.cursor;
      const rewrote = yield* scanPass(context, options.pageSize, {
        from: resume,
        onPage: (cursor, rewritten) => {
          record(cursor, rewritten);
          return options.save([...states.values()]);
        },
      });
      // Done once a full pass finds nothing to rewrite: it also catches an
      // old row written behind the cursor. A first scan from the start that
      // rewrote nothing was that pass already.
      let verify = resume !== null || rewrote > 0;
      while (verify) {
        const again = yield* scanPass(context, options.pageSize, {
          from: null,
          onPage: (_cursor, rewritten) =>
            Effect.sync(() => {
              for (const [id, state] of states)
                states.set(id, {
                  ...state,
                  rowsRewritten: state.rowsRewritten + (rewritten.get(id) ?? 0),
                });
            }),
        });
        verify = again > 0;
      }
      const finishedAt = yield* now;
      const done = [...states.values()].map((state): BackfillState => ({
        ...state,
        status: 'done',
        cursor: null,
        finishedAt,
      }));
      yield* options.save(done);
      finished.push(...done);
    }
    return finished;
  });
