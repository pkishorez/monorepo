import { describe, expect, expectTypeOf, it } from '@effect/vitest';
import { Effect, Exit, Schema } from 'effect';
import {
  ESchema,
  EntityESchema,
  ValueESchema,
  findNeedsBackfill,
  gapVersions,
  migrateToGap,
  readToGap,
  type ESchemaVersions,
  type GapVersions,
  type PreviousVersion,
  type VersionValue,
} from '../index.js';
import { inspectESchema } from '../domain/introspection/index.js';
import { expectUpgradable } from '../testing/index.js';

// v2 adds a migrated field, v3 is a gap (an owner no v2 row can know), v4
// migrates again.
const Task = EntityESchema.make('Task', 'taskId', { title: Schema.String })
  .evolve('v2', { done: Schema.Boolean }, (v1) => ({ ...v1, done: false }))
  .evolve('v3', { ownerId: Schema.String })
  .evolve('v4', { label: Schema.String }, (v3) => ({
    ...v3,
    label: `${v3.title} (${v3.ownerId})`,
  }))
  .build();

const read = (stored: unknown) =>
  Effect.runSyncExit(Schema.decodeUnknownEffect(Task.schema)(stored));

describe('gap version', () => {
  it('is declared by evolve with no migration', () => {
    expect(gapVersions(Task)).toEqual(['v3']);
    expect(inspectESchema(Task).evolutions.map(({ gap }) => gap)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    const Plain = ESchema.make('Plain', { a: Schema.String })
      .evolve('v2', { b: Schema.String })
      .build();
    expect(gapVersions(Plain)).toEqual(['v2']);
  });

  it('fails a row stored before it with NeedsBackfill', () => {
    for (const stored of [
      { _v: 'v1', taskId: 't1', title: 'Plan' },
      { _v: 'v2', taskId: 't1', title: 'Plan', done: true },
      { taskId: 't1', title: 'Plan' },
    ]) {
      const exit = read(stored);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(findNeedsBackfill(exit)).toMatchObject({
        _tag: 'NeedsBackfill',
        schema: 'Task',
        version: stored._v ?? 'v1',
        gapVersion: 'v3',
      });
    }
  });

  it('fails an Entity stored before it with NeedsBackfill', () => {
    const exit = Effect.runSyncExit(
      Schema.decodeUnknownEffect(Task.entity)({
        value: { taskId: 't1', title: 'Plan' },
        meta: { _e: 'Task', _v: 'v1', _u: '1', _d: false },
      }),
    );
    expect(findNeedsBackfill(exit)?.gapVersion).toBe('v3');
  });

  it('reads a row at the gap and migrates it past', () => {
    const atGap = { taskId: 't1', title: 'Plan', done: true, ownerId: 'ann' };
    expect(read({ ...atGap, _v: 'v3' })).toEqual(
      Exit.succeed({ ...atGap, label: 'Plan (ann)' }),
    );
    expect(read({ ...atGap, _v: 'v4', label: 'kept' })).toEqual(
      Exit.succeed({ ...atGap, label: 'kept' }),
    );
  });

  it('readToGap migrates up to, not across, the next gap', () => {
    expect(
      Effect.runSync(readToGap(Task, { _v: 'v1', taskId: 't1', title: 'P' })),
    ).toEqual({
      version: 'v2',
      value: { taskId: 't1', title: 'P', done: false },
    });
    expect(
      Effect.runSync(
        readToGap(Task, {
          _v: 'v3',
          taskId: 't1',
          title: 'P',
          done: true,
          ownerId: 'ann',
        }),
      ),
    ).toEqual({
      version: 'v4',
      value: {
        taskId: 't1',
        title: 'P',
        done: true,
        ownerId: 'ann',
        label: 'P (ann)',
      },
    });
  });

  it('migrateToGap runs the migrations after a filled gap', () => {
    const filled = { taskId: 't1', title: 'P', done: false, ownerId: 'bo' };
    expect(Effect.runSync(migrateToGap(Task, 'v3', filled))).toEqual({
      version: 'v4',
      value: { ...filled, label: 'P (bo)' },
    });
    const notV3 = Effect.runSync(
      migrateToGap(Task, 'v3', { taskId: 't1', title: 'P' }).pipe(Effect.flip),
    );
    expect(notV3.message).toBe('Not a Task v3 value');
    const unknown = Effect.runSync(
      migrateToGap(Task, 'v9', filled).pipe(Effect.flip),
    );
    expect(unknown.message).toBe('Unknown schema version: v9');
  });

  it('stops readToGap at a second gap', () => {
    const Twice = ESchema.make('Twice', { a: Schema.String })
      .evolve('v2', { b: Schema.String })
      .evolve('v3', { c: Schema.String }, (v2) => ({ ...v2, c: v2.b }))
      .evolve('v4', { d: Schema.String })
      .build();
    expect(gapVersions(Twice)).toEqual(['v2', 'v4']);
    expect(
      Effect.runSync(readToGap(Twice, { _v: 'v2', a: 'a', b: 'b' })),
    ).toEqual({
      version: 'v3',
      value: { a: 'a', b: 'b', c: 'b' },
    });
    expect(
      Effect.runSync(migrateToGap(Twice, 'v2', { a: 'a', b: 'b' })),
    ).toEqual({
      version: 'v3',
      value: { a: 'a', b: 'b', c: 'b' },
    });
    const exit = Effect.runSyncExit(
      Schema.decodeUnknownEffect(Twice.schema)({ _v: 'v2', a: 'a', b: 'b' }),
    );
    expect(findNeedsBackfill(exit)?.gapVersion).toBe('v4');
  });

  it('refuses a nested ESchema that has one', () => {
    const Address = ESchema.make('Address', { city: Schema.String })
      .evolve('v2', { zip: Schema.String })
      .build();
    const message =
      'Person v1: a field nests Address, whose v2 is a gap version. A nested ESchema must migrate every version; put the gap version on the stored entity instead.';
    expect(() =>
      EntityESchema.make('Person', 'personId', {
        home: Address.schema,
      }).build(),
    ).toThrow(message);
    expect(() =>
      ESchema.make('Person', { homes: Schema.Array(Address.schema) }).build(),
    ).toThrow(message);
    expect(() =>
      ValueESchema.make('Person', Schema.NullOr(Address.schema)).build(),
    ).toThrow(message);
  });

  it('remembers the value at every version in its type', () => {
    type Versions = ESchemaVersions<typeof Task>;
    expectTypeOf<keyof Versions>().toEqualTypeOf<'v1' | 'v2' | 'v3' | 'v4'>();
    expectTypeOf<VersionValue<typeof Task, 'v1'>>().toEqualTypeOf<{
      readonly title: string;
      readonly taskId: string;
    }>();
    expectTypeOf<VersionValue<typeof Task, 'v3'>>().toEqualTypeOf<{
      readonly title: string;
      readonly done: boolean;
      readonly ownerId: string;
      readonly taskId: string;
    }>();
    expectTypeOf<VersionValue<typeof Task, 'v4'>>().toEqualTypeOf<
      typeof Task.Type
    >();
    expectTypeOf<GapVersions<typeof Task>>().toEqualTypeOf<'v3'>();
    expectTypeOf<
      PreviousVersion<GapVersions<typeof Task>>
    >().toEqualTypeOf<'v2'>();
    expectTypeOf<PreviousVersion<'v1'>>().toBeNever();

    const NoGap = ESchema.make('NoGap', { a: Schema.String }).build();
    expectTypeOf<GapVersions<typeof NoGap>>().toBeNever();
    expectTypeOf<VersionValue<typeof NoGap, 'v1'>>().toEqualTypeOf<{
      readonly a: string;
    }>();
  });
});

describe('expectUpgradable with a gap version', () => {
  it('passes when rows before the gap wait for a Backfill', async () => {
    await expectUpgradable(Task, { runs: 20, unchanged: ['title'] });
  });

  it('fails when a migration before the gap throws', async () => {
    const Broken = ESchema.make('Broken', { a: Schema.String })
      .evolve('v2', { b: Schema.String }, () => {
        throw new Error('boom');
      })
      .evolve('v3', { c: Schema.String })
      .build();
    await expect(expectUpgradable(Broken, { runs: 5 })).rejects.toThrow(
      /Broken v1 → gap v3: upgrade failed: .*boom/,
    );
  });

  it('fails when a migration before the gap breaks its version', async () => {
    const Fraction = ESchema.make('Fraction', { a: Schema.String })
      .evolve('v2', { n: Schema.Int }, (v1) => ({ ...v1, n: 1.5 }))
      .evolve('v3', { c: Schema.String })
      .build();
    const error = Effect.runSync(
      readToGap(Fraction, { _v: 'v1', a: 'a' }).pipe(Effect.flip),
    );
    expect(error.message).toBe('Migration to v2 produced a value v2 refuses');
    const fromV1 = Effect.runSync(
      migrateToGap(Fraction, 'v1', { a: 'a' }).pipe(Effect.flip),
    );
    expect(fromV1.message).toBe('Migration to v2 produced a value v2 refuses');
    await expect(expectUpgradable(Fraction, { runs: 5 })).rejects.toThrow(
      /Fraction v1 → gap v3: upgrade failed: Migration to v2 produced a value v2 refuses/,
    );
  });

  it('fails when a migration before the gap changes an unchanged path', async () => {
    const Moving = ESchema.make('Moving', { a: Schema.String })
      .evolve('v2', { b: Schema.String }, (v1) => ({ a: 'moved', b: v1.a }))
      .evolve('v3', { c: Schema.String })
      .build();
    await expect(
      expectUpgradable(Moving, { runs: 5, unchanged: ['a'] }),
    ).rejects.toThrow(/Moving v1 → gap v3: unchanged failed: a changed/);
  });
});
