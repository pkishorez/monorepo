import { Effect } from 'effect';
import { Address, History, Snapshot } from '@kestack/kabuki';
import type { Blueprint } from '@kestack/kabuki';
import type { AnyActor, Instance } from '@kestack/kabuki/types';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { trimmed } from '../../../server/rpc/contract/index.ts';
import type {
  Node,
  StepAsked,
  Stepped,
} from '../../../server/rpc/session/contract/index.ts';
import {
  blueprintAt,
  encodedChange,
  encodedData,
  encodedMessage,
  keyOf,
} from './encode.ts';
import { askedOf, providesOf } from './levels.ts';
import { childrenOf, playedOf } from './played.ts';
import { replayed, resolve, runtimeOf } from './running.ts';
import { workOf } from './work.ts';

const withoutTag = (state: unknown): unknown => {
  if (typeof state !== 'object' || state === null) return state;
  const { _tag: _, ...data } = state as Readonly<Record<string, unknown>>;
  return data;
};

export const slotOf = (address: string): string | null =>
  Address.parse(address as Address).path.at(-1)?.slot ?? null;

const nodeOf = (
  actor: AnyActor,
  snapshot: Snapshot,
  instance: Instance,
): Node => {
  const { address } = instance;
  const print = blueprintAt(actor.blueprint, address);
  const tag = instance.state._tag;
  const key = keyOf(address);
  const { state, model, ...rest } = encodedData(instance, print);
  return {
    address,
    actor: instance.actor,
    slot: slotOf(address),
    ...(key === undefined ? {} : { key }),
    state: tag,
    data: trimmed(withoutTag(state)),
    model: trimmed(model),
    ...('props' in rest ? { props: trimmed(rest.props) } : {}),
    workers: askedOf(
      print,
      tag,
      Snapshot.workers(actor, snapshot, address as Address),
    ),
    provides: providesOf(print, tag),
    children: childrenOf(instance).map((child) =>
      nodeOf(actor, snapshot, child),
    ),
  };
};

const whole = (
  actor: AnyActor,
  root: Blueprint,
  history: History,
  id: number | null,
) => {
  const entry = id === null ? undefined : History.entry(history, id);
  if (!entry) {
    const snapshot = History.snapshot(actor, history, id);
    return {
      tree: nodeOf(actor, snapshot, snapshot.root),
      message: null,
      changes: [],
    };
  }
  const { after, outcome, changes, commands, emits } = playedOf(
    actor,
    history,
    entry,
  );
  return {
    tree: nodeOf(actor, after, after.root),
    message: {
      id: entry.id,
      to: entry.to,
      tag: entry.message._tag,
      message: encodedMessage(root, entry.to, entry.message),
      from: entry.from,
      at: entry.at,
      outcome,
      commands: commands.map(({ name, args }) =>
        args === undefined ? { name } : { name, args: trimmed(args) },
      ),
      emits: emits.map(({ event, becomes }) => ({
        tag: event._tag,
        payload: trimmed(withoutTag(event)),
        ...(becomes ? { becomes } : {}),
      })),
    },
    changes: changes.map((change) => encodedChange(root, change)),
  };
};

export const stepAt = (app: AppRuntime, { at }: StepAsked) =>
  Effect.gen(function* () {
    const runtime = yield* runtimeOf(app);
    const { actor } = runtime;
    const { history } = app;
    const { id, step } = yield* resolve(history, at);
    const made = yield* replayed(history, step, () =>
      whole(actor, actor.blueprint, history, id),
    );
    const stepped: Stepped = {
      at: step,
      ...made,
      ...(id === history.head ? { work: workOf(runtime) } : {}),
    };
    return stepped;
  });
