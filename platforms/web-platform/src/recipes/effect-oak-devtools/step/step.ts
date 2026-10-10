import { instanceAt, isMany } from 'effect-oak';
import type { Entry, Instance, Snapshot } from 'effect-oak';

/*
 * A Step, and the facts about it every view shares: what kind of change it
 * made, from the Snapshots right before and after it, and how to name what it
 * carried. Pure, and remembered per entry, since entries never change.
 */

/** A Step: right after init, or right after an entry. */
export type Step = Entry | 'init';

/** What a Step did to the Instance its Message went to. */
export type Kind =
  | 'init'
  | 'transition'
  | 'update'
  | 'still'
  | 'ignored'
  | 'dropped';

/** The Snapshots right before and after a Step; init has nothing before it. */
export interface Around {
  readonly before: Snapshot | undefined;
  readonly after: Snapshot;
}

export const KIND_LABEL: Record<Kind, string> = {
  init: 'Init',
  transition: 'Transition',
  update: 'Update',
  still: 'No change',
  ignored: 'Ignored',
  dropped: 'Dropped',
};

const kinds = new WeakMap<Entry, Kind>();

export const kindOf = (step: Step, around: Around | undefined): Kind => {
  if (step === 'init') return 'init';
  let kind = kinds.get(step);
  if (kind) return kind;
  if (step.outcome !== 'handled') kind = step.outcome;
  else if (step.from !== step.to) kind = 'transition';
  else if (!around) return 'update';
  else {
    const was = around.before && instanceAt(around.before, step.instance);
    const is = instanceAt(around.after, step.instance);
    kind =
      was?.model !== is?.model || was?.state !== is?.state ? 'update' : 'still';
  }
  kinds.set(step, kind);
  return kind;
};

/** An Instance's Children, every slot, in order. */
export const kidsOf = (instance: Instance): ReadonlyArray<Instance> =>
  Object.values(instance.children).flatMap((held) =>
    isMany(held) ? held : [held],
  );

/** A Message's fields besides its tag. */
export const payloadOf = ({ _tag, ...payload }: { readonly _tag: string }) =>
  payload;

/** The last part of an Instance ID, short enough for a row. */
export const shortId = (id: string) => id.slice(id.lastIndexOf('/') + 1);

/** Time, in seconds. */
export const seconds = (millis: number) => `${(millis / 1000).toFixed(2)}s`;

/**
 * An Instance and everything below it as plain data: no State for an Actor
 * without States, and none of the Runtime's own bookkeeping.
 */
export const describe = (instance: Instance): object => ({
  id: instance.id,
  actor: instance.actor,
  ...(instance.key === undefined ? {} : { key: instance.key }),
  ...(instance.state._tag === 'Single' ? {} : { state: instance.state }),
  model: instance.model,
  ...(Object.keys(instance.children).length === 0
    ? {}
    : {
        children: Object.fromEntries(
          Object.entries(instance.children).map(([slot, held]) => [
            slot,
            isMany(held) ? held.map(describe) : describe(held),
          ]),
        ),
      }),
});
