import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../db/index.js';
import { type AnyEntityESchema, EntityESchema } from '../../eschema/index.js';
import {
  SnapshotIncompatible,
  TableSnapshot,
  TableSnapshotESchema,
} from '../../snapshot/index.js';
import { acceptSnapshot } from '../snapshot-guard/snapshot-guard.js';

/** The stored form of a one-entity table's snapshot, as the guard receives it. */
const stored = (schema: AnyEntityESchema) => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  table.entity(schema).primary().build();
  return Effect.runSync(
    TableSnapshotESchema.encode(TableSnapshot.capture(table)),
  );
};

const v1 = stored(
  EntityESchema.make('Task', 'id', { title: Schema.String }).build(),
);
const appended = stored(
  EntityESchema.make('Task', 'id', { title: Schema.String })
    .evolve('v2', { title: Schema.String, done: Schema.Boolean }, (task) => ({
      ...task,
      done: false,
    }))
    .build(),
);
const edited = stored(
  EntityESchema.make('Task', 'id', { title: Schema.Number }).build(),
);

describe('snapshot guard', () => {
  it('records the first snapshot for a target', () => {
    const next = { target: 'db-1', snapshot: v1 };
    expect(Effect.runSync(acceptSnapshot(undefined, next))).toEqual(next);
  });

  it('accepts an appended version', () => {
    const next = { target: 'db-1', snapshot: appended };
    expect(
      Effect.runSync(acceptSnapshot({ target: 'db-1', snapshot: v1 }, next)),
    ).toEqual(next);
  });

  it('refuses an edited version and names the change', () => {
    const exit = Effect.runSyncExit(
      acceptSnapshot(
        { target: 'db-1', snapshot: v1 },
        { target: 'db-1', snapshot: edited },
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const error = Exit.isFailure(exit)
      ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error
      : undefined;
    expect(error).toBeInstanceOf(SnapshotIncompatible);
    expect((error as SnapshotIncompatible).changes.length).toBeGreaterThan(0);
  });

  it('starts a fresh baseline when the target changes', () => {
    const next = { target: 'db-2', snapshot: edited };
    expect(
      Effect.runSync(acceptSnapshot({ target: 'db-1', snapshot: v1 }, next)),
    ).toEqual(next);
  });
});
