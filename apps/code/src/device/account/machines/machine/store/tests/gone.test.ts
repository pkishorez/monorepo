import { Effect, Layer } from 'effect';
import { Store as MemoryStore } from '@kestack/std-toolkit/replica/memory';
import { describe, expect, it } from 'vitest';
import {
  Cache,
  dropEverywhere,
  type Gone,
  SavedDrafts,
  Seen,
  Sync,
  went,
} from '../index.ts';
import { Storage } from '../../../../store/index.ts';

/*
 * What the user asked to go, told to every store: a Project removed and a
 * Machine forgotten reach each one, records, marks, cached copies and
 * Saved Drafts alike, and a Machine's database goes after them all.
 */

/** The stores each Gone reached, in order, by name. */
const told = (gone: Gone) => {
  const reached: Array<string> = [];
  const store = (name: string) => ({
    drop: () => Effect.sync(() => void reached.push(name)),
  });
  return Effect.runPromise(
    dropEverywhere(gone).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.mock(Sync)({
            ...store('records'),
            store: () => MemoryStore.memory(),
          }),
          Layer.mock(Seen)(store('marks')),
          Layer.mock(Cache)(store('kept')),
          Layer.mock(SavedDrafts)(store('drafts')),
          Layer.mock(Storage)({
            dropMachine: (_, machineId) =>
              Effect.sync(() => void reached.push(`database ${machineId}`)),
          }),
        ),
      ),
      Effect.as(reached),
    ),
  );
};

describe('dropEverywhere', () => {
  it('tells every store of a Project removed, and keeps its Machine’s database', async () => {
    expect(
      await told({
        _tag: 'Project',
        accountId: 'a1',
        machineId: 'm1',
        projectId: 'p1',
      }),
    ).toEqual(['records', 'marks', 'kept', 'drafts']);
  });

  it('deletes a Machine forgotten’s database once every store has let it go', async () => {
    expect(
      await told({ _tag: 'Machine', accountId: 'a1', machineId: 'm1' }),
    ).toEqual(['records', 'marks', 'kept', 'drafts', 'database m1']);
  });
});

describe('went', () => {
  const row = { accountId: 'a1', machineId: 'm1', projectId: 'p1' };

  it('takes a Project’s rows, and its Machine’s, of its own Account only', () => {
    const project = {
      _tag: 'Project',
      accountId: 'a1',
      machineId: 'm1',
      projectId: 'p1',
    } as const;
    expect(went(project)(row)).toBe(true);
    expect(went(project)({ ...row, projectId: 'p2' })).toBe(false);
    expect(went(project)({ ...row, accountId: 'a2' })).toBe(false);
    const machine = {
      _tag: 'Machine',
      accountId: 'a1',
      machineId: 'm1',
    } as const;
    expect(went(machine)({ ...row, projectId: null })).toBe(true);
    expect(went(machine)({ ...row, machineId: 'm2' })).toBe(false);
  });
});
