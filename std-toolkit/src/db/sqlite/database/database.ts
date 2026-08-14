import type { Effect } from 'effect';
import type { SQLiteRow, SQLiteValue } from '../item-schema/index.js';

export type { SQLiteRow, SQLiteValue };

export interface SQLiteRunResult {
  readonly changes: number;
}

export interface SQLiteStatement {
  readonly sql: string;
  readonly parameters?: readonly SQLiteValue[];
  readonly expectedChanges?: number;
}

export class SQLiteChangesMismatch extends Error {}

export interface SQLiteDriver {
  readonly run: (
    sql: string,
    parameters?: readonly SQLiteValue[],
  ) => Effect.Effect<SQLiteRunResult, unknown>;
  readonly all: (
    sql: string,
    parameters?: readonly SQLiteValue[],
  ) => Effect.Effect<readonly SQLiteRow[], unknown>;
  readonly transaction: (
    statements: readonly SQLiteStatement[],
  ) => Effect.Effect<void, unknown>;
  readonly close?: () => void;
}
