import { Data, Effect, type Layer } from 'effect';
import { nextUlid } from '../../../core/index.js';
import type { AnyESchema } from '../../../eschema/index.js';
import { migrateToGap, readToGap } from '../../../gap-steps/index.js';
import {
  ConditionFailure,
  OperationFailure,
  type StdTableContract,
  type StdTableService,
  type StoredItem,
  type StoredKey,
} from '../../std-table/contract/index.js';
import type { BackfillDeclaration } from '../../std-table/definition/index.js';
import { storedForm, type StdTable } from '../../std-table/table/index.js';

/**
 * A Backfill could not rewrite a row: its `run` failed or returned a value
 * its version refuses (`run`), the row could not be read (`unreadable`), or
 * the row kept changing under it (`conflict`).
 */
export class BackfillFailed extends Data.TaggedError('BackfillFailed')<{
  readonly message: string;
  readonly backfill: string;
  readonly key: StoredKey;
  readonly reason: 'run' | 'unreadable' | 'conflict' | 'key-changed';
  readonly cause?: unknown;
}> {}

/** A failure as one line: a DatabaseError says nothing until its reason does. */
const describe = (cause: unknown, depth = 0): string => {
  if (depth > 4) return String(cause);
  if (cause !== null && typeof cause === 'object') {
    const { _tag, reason, message } = cause as {
      _tag?: unknown;
      reason?: unknown;
      message?: unknown;
    };
    if (
      _tag === 'DatabaseError' &&
      reason !== null &&
      typeof reason === 'object'
    ) {
      const detail = reason as {
        _tag?: unknown;
        entity?: unknown;
        message?: unknown;
        cause?: unknown;
      };
      return [
        `DatabaseError ${String(detail._tag)}`,
        ...(typeof detail.entity === 'string' ? [` on ${detail.entity}`] : []),
        ...(typeof detail.message === 'string' && detail.message !== ''
          ? [`: ${detail.message}`]
          : detail.cause === undefined
            ? []
            : [`: ${describe(detail.cause, depth + 1)}`]),
      ].join('');
    }
    if (typeof message === 'string' && message !== '') return message;
    if (typeof _tag === 'string') return _tag;
  }
  return String(cause);
};

const backfillFailed = (
  backfill: string,
  item: StoredKey,
  reason: BackfillFailed['reason'],
  cause?: unknown,
) =>
  new BackfillFailed({
    message: `std-toolkit: Backfill "${backfill}" failed on row ${JSON.stringify([item.pk, item.sk])}: ${
      reason === 'run'
        ? `its run failed: ${describe(cause)}`
        : reason === 'unreadable'
          ? `the row cannot be read: ${describe(cause)}`
          : reason === 'key-changed'
            ? `its value derives a different key ${String(cause)}; an entity key never changes (delete and insert instead)`
            : 'the row changed under it twice'
    }`,
    backfill,
    key: { pk: item.pk, sk: item.sk },
    reason,
    ...(cause === undefined ? {} : { cause }),
  });

/** What one stage knows about the entity it scans. */
export interface RowContext {
  readonly table: StdTable;
  readonly store: StdTableContract;
  readonly layer: Layer.Layer<StdTableService<string>>;
  readonly schema: AnyESchema;
  readonly entity: string;
  /** Every gap Backfill declared for the entity, by the version it fills. */
  readonly gaps: ReadonlyMap<string, BackfillDeclaration>;
  /** The stage's reindexes of the entity; each checks every row. */
  readonly reindexes: readonly BackfillDeclaration[];
  /** Every entity but this stage's own, read-only: its rows may still be old. */
  readonly reads: object;
  /** The Backfill named when a row fails outside any one Backfill's step. */
  readonly first: string;
}

const nextVersion = (version: string) => `v${Number(version.slice(1)) + 1}`;

/**
 * The row's one write, if it needs one: folded through every gap it is
 * before (each gap's Backfill, then the pure migrations up to the next gap)
 * and stored at the latest version under a new `_u`; or, with a reindex in
 * the stage, its current form when its index keys are stale. The value must
 * keep the row's key: the write is guarded on this row's `_u` alone, which
 * rows written in one transaction share, so a new key could overwrite
 * another row.
 */
const rewrite = (
  context: RowContext,
  item: StoredItem,
): Effect.Effect<
  { readonly item: StoredItem; readonly ran: readonly string[] } | undefined,
  BackfillFailed
> =>
  Effect.gen(function* () {
    const { schema } = context;
    let current = yield* readToGap(schema, item.data).pipe(
      Effect.mapError((cause) =>
        backfillFailed(context.first, item, 'unreadable', cause),
      ),
    );
    const ran: string[] = [];
    while (current.version !== schema.latestVersion) {
      const gap = nextVersion(current.version);
      const backfill = context.gaps.get(gap);
      if (backfill?.run == null)
        return yield* Effect.fail(
          backfillFailed(
            context.first,
            item,
            'unreadable',
            new Error(`no Backfill fills ${context.entity} ${gap}`),
          ),
        );
      const run = backfill.run as (
        value: unknown,
        reads: object,
      ) => Effect.Effect<unknown, unknown, StdTableService<string>>;
      const filled = yield* run(current.value, context.reads).pipe(
        Effect.provide(context.layer),
        Effect.mapError((cause) =>
          backfillFailed(backfill.id, item, 'run', cause),
        ),
      );
      current = yield* migrateToGap(schema, gap, filled).pipe(
        Effect.mapError((cause) =>
          backfillFailed(backfill.id, item, 'run', cause),
        ),
      );
      ran.push(backfill.id);
    }
    if (ran.length > 0) {
      const next = yield* storedForm(
        context.table,
        context.entity,
        current.value as object,
        { _u: yield* nextUlid, _d: item.meta._d },
      ).pipe(
        Effect.mapError((cause) =>
          backfillFailed(ran.at(-1)!, item, 'run', cause),
        ),
      );
      if (next.pk !== item.pk || next.sk !== item.sk)
        return yield* Effect.fail(
          backfillFailed(
            ran.at(-1)!,
            item,
            'key-changed',
            JSON.stringify([next.pk, next.sk]),
          ),
        );
      // Written with fresh keys, so every reindex of the stage is satisfied.
      return {
        item: next,
        ran: [...ran, ...context.reindexes.map(({ id }) => id)],
      };
    }
    const [reindex] = context.reindexes;
    if (reindex === undefined) return undefined;
    const drift = yield* context.table.drift(item).pipe(
      Effect.provide(context.layer),
      Effect.mapError((cause) =>
        backfillFailed(reindex.id, item, 'unreadable', cause),
      ),
    );
    return drift.drifted
      ? { item: drift.currentForm, ran: context.reindexes.map(({ id }) => id) }
      : undefined;
  });

/**
 * Rewrites one row if it needs it, guarded on the `_u` it was read at. A
 * conflict re-reads the row and tries once more; a second one fails. It
 * fires no Change Notice. Returns the Backfills that rewrote it.
 */
export const backfillRow = (
  context: RowContext,
  item: StoredItem,
): Effect.Effect<readonly string[], BackfillFailed | OperationFailure> =>
  Effect.gen(function* () {
    let read = item;
    for (let attempt = 1; ; attempt++) {
      const write = yield* rewrite(context, read);
      if (write === undefined) return [];
      const result = yield* context.store
        .writeItem({
          item: write.item,
          condition: { kind: 'updated', value: read.meta._u },
        })
        .pipe(Effect.result);
      if (result._tag === 'Success') return write.ran;
      if (!(result.failure instanceof ConditionFailure))
        return yield* Effect.fail(result.failure);
      if (attempt === 2)
        return yield* Effect.fail(
          backfillFailed(write.ran[0]!, read, 'conflict'),
        );
      const fresh = yield* context.store
        .getItem(read, { consistent: true })
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof OperationFailure
              ? cause
              : new OperationFailure({ cause }),
          ),
        );
      if (fresh === null) return [];
      read = fresh;
    }
  });
