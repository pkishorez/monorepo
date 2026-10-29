import { Data, type Effect } from 'effect';
import type { Entity, SingletonEntity } from '../../../core/index.js';
import type {
  AnyEntityESchema,
  AnyUnkeyedESchema,
} from '../../../eschema/index.js';
import type { StoredKey } from '../../std-table/contract/index.js';
import type { StdTable } from '../../std-table/table/index.js';

// What a table migration (ADR 0022) is typed as: its handlers, its events
// and its errors.

/** A built table: the table surface and its entities under their names. */
export type AnyStdTable = StdTable<string>;

type EntitySurface = {
  readonly kind: 'keyed' | 'single';
  readonly schema: unknown;
};

/** A built table's entity surfaces, by entity name. */
export type EntitiesOf<T> = {
  readonly [K in keyof T as T[K] extends EntitySurface ? K : never]: T[K];
};

/** One old row as its handler gets it: decoded at its latest value, with its meta. */
export type MigrationRowOf<E> = E extends {
  readonly kind: 'keyed';
  readonly schema: infer S extends AnyEntityESchema;
}
  ? Entity<S['Type']>
  : E extends {
        readonly kind: 'single';
        readonly schema: infer S extends AnyUnkeyedESchema;
      }
    ? SingletonEntity<S['Type']>
    : never;

/** The old table's entities, with their reads only. */
export type ReadOnlyEntities<T> = {
  readonly [K in keyof EntitiesOf<T>]: EntitiesOf<T>[K] extends infer E extends
    {
      readonly kind: 'keyed';
      readonly get: unknown;
      readonly query: unknown;
    }
    ? Pick<E, 'get' | 'query'>
    : EntitiesOf<T>[K] extends infer E extends { readonly get: unknown }
      ? Pick<E, 'get'>
      : never;
};

/** What every handler gets beside its row. */
export interface MigrationTables<Old, Next> {
  /** The old table, read-only: its writes die. */
  readonly old: ReadOnlyEntities<Old>;
  /** The new table. Every row put through it counts as written. */
  readonly next: Next;
}

/**
 * One handler per entity of the old table, keyed by entity name. A handler
 * writes any number of rows into the new table, none included; its failure
 * fails the run.
 */
export type MigrationHandlers<Old, Next> = {
  readonly [K in keyof EntitiesOf<Old>]: (
    row: MigrationRowOf<EntitiesOf<Old>[K]>,
    tables: MigrationTables<Old, Next>,
  ) => Effect.Effect<unknown, any, any>;
};

/** Refuses a handler for an entity the old table does not have. */
export type NoExtraHandlers<Old, H> = {
  readonly [K in Exclude<keyof H, keyof EntitiesOf<Old>>]: never;
};

type HandlerEffect<H> = {
  readonly [K in keyof H]: H[K] extends (
    ...args: never[]
  ) => Effect.Effect<unknown, infer E, infer R>
    ? [E, R]
    : never;
}[keyof H];

export type HandlerError<H> = HandlerEffect<H>[0];
export type HandlerContext<H> = HandlerEffect<H>[1];

export interface MigrationOptions {
  /** Handlers in flight at once; 1 by default. */
  readonly concurrency?: number;
  /** Rows per scan page of the old table; 100 by default. */
  readonly pageSize?: number;
}

/** Rows read from the old table and written to the new one, by old entity. */
export type MigrationCounts = Readonly<
  Record<string, { readonly read: number; readonly written: number }>
>;

/** What a run reports, in order. */
export type MigrationEvent =
  /** The new table already holds this migration: nothing ran. */
  | { readonly _tag: 'Skipped' }
  /** A run began; `restarted` when it cleared a crashed run's rows first. */
  | {
      readonly _tag: 'Started';
      readonly attempt: number;
      readonly restarted: boolean;
    }
  /** After each page of the old table. */
  | {
      readonly _tag: 'Progress';
      readonly read: number;
      readonly written: number;
      /** About how many rows the old table holds, when the adapter can say. */
      readonly total: number | undefined;
      readonly counts: MigrationCounts;
    }
  /** Every row is through, and the migration row says `done`. */
  | { readonly _tag: 'Done'; readonly counts: MigrationCounts };

export type MigrationRefusedReason =
  /** The new table has no Stored contract, or one other code set up. */
  | 'target-not-set-up'
  /** The new table is disposable: it starts empty instead. */
  | 'target-disposable'
  /** The new table holds rows but no migration row. */
  | 'target-in-use'
  /** The new table finished a migration from another table or contract. */
  | 'other-source'
  /** The old table's Stored contract is not its declaration's. */
  | 'source-changed';

const refusalMessage = (
  reason: MigrationRefusedReason,
  from: string,
  to: string,
) => {
  switch (reason) {
    case 'target-not-set-up':
      return `std-toolkit: table "${to}" is not set up under this code, so "${from}" cannot migrate into it. Run its setup first.`;
    case 'target-disposable':
      return `std-toolkit: table "${to}" is disposable: it starts empty instead of being migrated into. Nothing was changed.`;
    case 'target-in-use':
      return `std-toolkit: table "${to}" already holds rows no migration wrote, so "${from}" cannot migrate into it. Nothing was changed.`;
    case 'other-source':
      return `std-toolkit: table "${to}" already finished a migration from another table or contract than "${from}". Nothing was changed.`;
    case 'source-changed':
      return `std-toolkit: table "${from}" was not set up under its declaration in this code, so its rows cannot be read as typed. Set it up under exactly this code, then migrate. Nothing was changed.`;
  }
};

/** A run refused before it changed anything. */
export class MigrationRefused extends Data.TaggedError('MigrationRefused')<{
  readonly reason: MigrationRefusedReason;
  readonly from: string;
  readonly to: string;
  readonly message: string;
}> {
  static of(reason: MigrationRefusedReason, from: string, to: string) {
    return new MigrationRefused({
      reason,
      from,
      to,
      message: refusalMessage(reason, from, to),
    });
  }
}

/**
 * One old row failed: it did not decode, or its handler failed. The run
 * fails, its migration row stays `running`, and the next run starts over.
 */
export class MigrationRowFailed<E = unknown> extends Data.TaggedError(
  'MigrationRowFailed',
)<{
  readonly entity: string;
  readonly key: StoredKey;
  readonly cause: E;
  readonly message: string;
}> {}
