import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../db/index.js';
import { type AnyEntityESchema, EntityESchema } from '../../eschema/index.js';
import { SnapshotIncompatible, TableSnapshot } from '../../snapshot/index.js';
import { checkUpgrade } from '../snapshot-guard/snapshot-guard.js';

const stored = (schema: AnyEntityESchema) => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  table.entity(schema).primary().build();
  return Effect.runSync(TableSnapshot.serialize(TableSnapshot.capture(table)));
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
  it('accepts the first snapshot', () => {
    expect(
      Exit.isSuccess(Effect.runSyncExit(checkUpgrade(undefined, v1))),
    ).toBe(true);
  });

  it('accepts an appended version', () => {
    expect(Exit.isSuccess(Effect.runSyncExit(checkUpgrade(v1, appended)))).toBe(
      true,
    );
  });

  it('refuses an edited version and names the change', () => {
    const exit = Effect.runSyncExit(checkUpgrade(v1, edited));
    expect(Exit.isFailure(exit)).toBe(true);
    const error = Exit.isFailure(exit)
      ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error
      : undefined;
    expect(error).toBeInstanceOf(SnapshotIncompatible);
    expect((error as SnapshotIncompatible).changes.length).toBeGreaterThan(0);
  });
});
