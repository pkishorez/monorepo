import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccountReplicas } from './account-replicas.ts';
import { DeviceState } from './device-state.ts';
import { dropEverywhere, type Gone } from './gone.ts';
import { Kept } from './kept.ts';
import { SavedDrafts } from './saved-drafts.ts';

/*
 * What went, told to every store: records, kept copies and Unseen marks
 * go with any Gone; Saved Drafts only with what the user asked, a Project
 * removed or a Machine forgotten, never with a list that no longer names
 * them, which may have come short.
 */

/** The stores each Gone reached, by name. */
const told = (gone: Gone) => {
  const reached: Array<string> = [];
  const store = (name: string) => ({
    drop: () => Effect.sync(() => void reached.push(name)),
  });
  return Effect.runPromise(
    dropEverywhere(gone).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.mock(AccountReplicas)(store('records')),
          Layer.mock(DeviceState)(store('marks')),
          Layer.mock(Kept)(store('kept')),
          Layer.mock(SavedDrafts)(store('drafts')),
        ),
      ),
      Effect.as(reached),
    ),
  );
};

describe('dropEverywhere', () => {
  it('takes the Saved Drafts of a Project removed and a Machine forgotten', async () => {
    const all = ['records', 'marks', 'kept', 'drafts'];
    expect(
      await told({ _tag: 'Project', machineId: 'm1', projectId: 'p1' }),
    ).toEqual(all);
    expect(
      await told({ _tag: 'Machine', accountId: 'a1', machineId: 'm1' }),
    ).toEqual(all);
  });

  it('never takes a Saved Draft for a list that no longer names it', async () => {
    const pruned = ['records', 'marks', 'kept'];
    expect(
      await told({ _tag: 'Unlisted', accountId: 'a1', listed: [] }),
    ).toEqual(pruned);
    expect(await told({ _tag: 'SignedOut', signedIn: [] })).toEqual(pruned);
  });
});
