import type { ActorDefinition, Tagged } from '../../actor/index.ts';
import type { Address } from '../address/index.ts';
import { changesOf, instanceAt, pathTo } from '../instance/index.ts';
import type { Change, Snapshot } from '../instance/index.ts';
import type { From } from './entry.ts';
import { next } from './next.ts';
import type { Played } from './next.ts';

/*
 * Try: what a Message would do to an Instance, worked out from the Snapshot
 * alone. Nothing is Sent, nothing runs, and nothing is kept: the same
 * Message after the same Snapshot says the same.
 *
 * 1. Find     the Instance at the Address. None: InstanceNotFound.
 * 2. Check    the Message against its Actor's Schema. No match: Refused.
 * 3. Rule     one for its tag at the top or in the current State. None:
 *             Unhandled, with the States that have one.
 * 4. Play     the Message through Next, at the Time given. An Update that
 *             gives what its Actor's Schemas refuse: Refused.
 * 5. Compare  nothing changed and nothing asked for or Emitted: NoChange.
 *             Else Changes: the Snapshot after, the Instance's Model fields
 *             that changed, what changed across the tree, the Commands
 *             asked for and what it Emitted.
 */

/** One Command an Update asked for, as data: nothing runs it. */
export interface Asked {
  readonly name: string;
  readonly args: unknown;
}

/** What a Message would do to an Instance, if it were Sent now. */
export type Tried<Model = unknown> =
  /** No Instance is at the Address now. */
  | { readonly _tag: 'InstanceNotFound' }
  /** It would be refused: the Message does not match its Schema, or the Update gives what its Actor's Schemas refuse. */
  | { readonly _tag: 'Refused'; readonly reason: string }
  /** No rule for it at the top or in the State the Instance is in: `handledIn` names the States with one. */
  | {
      readonly _tag: 'Unhandled';
      readonly state: string;
      readonly handledIn: ReadonlyArray<string>;
    }
  /** A rule runs, and changes nothing, asks for nothing and Emits nothing. */
  | { readonly _tag: 'NoChange' }
  /** A rule runs: the Snapshot after, the Model fields that change, what changes across the tree, the Commands asked for, what it Emits. */
  | {
      readonly _tag: 'Changes';
      readonly snapshot: Snapshot;
      readonly model: Partial<Model>;
      /** What changes at each Address, as `Snapshot.changes` says. */
      readonly changes: ReadonlyArray<Change>;
      readonly commands: ReadonlyArray<Asked>;
      readonly emits: ReadonlyArray<Tagged>;
    };

const OUTSIDE: From = { kind: 'outside' };

export const tryMessage = (
  root: ActorDefinition,
  snapshot: Snapshot,
  to: Address,
  message: Tagged,
  at: number,
): Tried => {
  // 1. Find
  const found = pathTo(root, snapshot.root, to)?.at(-1);
  if (!found) return { _tag: 'InstanceNotFound' };
  const { instance, definition } = found;

  // 2. Check
  try {
    definition.check.message(
      message,
      `Message ${JSON.stringify(message._tag)}`,
    );
  } catch (error) {
    return { _tag: 'Refused', reason: reasonOf(error) };
  }

  // 3. Rule
  const state = instance.state._tag;
  const { update } = definition;
  if (!update['*']?.[message._tag] && !update[state]?.[message._tag])
    return {
      _tag: 'Unhandled',
      state,
      handledIn: definition.states.filter((tag) => update[tag]?.[message._tag]),
    };

  // 4. Play
  let played: Played;
  try {
    played = next(root, snapshot, { to, message, from: OUTSIDE, at });
  } catch (error) {
    return { _tag: 'Refused', reason: reasonOf(error) };
  }

  // 5. Compare
  const { commands, emits } = played;
  if (
    played.snapshot.root === snapshot.root &&
    commands.length === 0 &&
    emits.length === 0
  )
    return { _tag: 'NoChange' };
  const after = instanceAt(played.snapshot.root, to);
  return {
    _tag: 'Changes',
    snapshot: played.snapshot,
    model: changedFields(instance.model, after?.model ?? instance.model),
    changes: changesOf(root, snapshot.root, played.snapshot.root),
    commands: commands.map((command) => {
      const { name, args } = command as Asked;
      return { name, args };
    }),
    emits,
  };
};

/** Why a check or an Update threw. */
const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The fields of `after` that are not the same as in `before`. */
const changedFields = (before: unknown, after: unknown): object => {
  const own = before as Readonly<Record<string, unknown>>;
  const next = after as Readonly<Record<string, unknown>>;
  return Object.fromEntries(
    Object.entries(next).filter(
      ([field, value]) => !Object.is(own[field], value),
    ),
  );
};
