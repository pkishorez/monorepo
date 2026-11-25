import { Effect } from 'effect';
import { Address, History } from '@kestack/kabuki';
import type { Blueprint, Snapshot } from '@kestack/kabuki';
import type { Instance, WorkerStatus } from '@kestack/kabuki/types';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { InstanceNotFound } from '../../../server/rpc/session/contract/index.ts';
import type {
  Look,
  LookAsked,
  Looked,
  Opened,
} from '../../../server/rpc/session/contract/index.ts';
import { blueprintAt, encodedData, keyOf } from './encode.ts';
import { fold } from './fold.ts';
import { changesOf, childrenOf, instancesOf, playedOf } from './played.ts';
import type { Change } from './played.ts';
import { replayed, resolve, runtimeOf } from './running.ts';

type Statuses = (address: string) => ReadonlyArray<WorkerStatus>;

const lookedOf = (
  instance: Instance,
  changes: ReadonlyMap<string, Change>,
): Looked => {
  const { address } = instance;
  const key = keyOf(address);
  return {
    address,
    place: Address.place(address),
    actor: instance.actor,
    slot: Address.parse(address).path.at(-1)?.slot ?? null,
    ...(key === undefined ? {} : { key }),
    state: instance.state._tag,
    change: changes.get(address) ?? null,
    children: childrenOf(instance).map((child) => lookedOf(child, changes)),
  };
};

const openedOf = (
  instance: Instance,
  root: Blueprint,
  statuses: Statuses,
): Opened => {
  const data = encodedData(instance, blueprintAt(root, instance.address));
  const state = fold(data.state);
  const model = fold(data.model);
  const props = 'props' in data ? fold(data.props) : undefined;
  return {
    state: state.value,
    model: model.value,
    ...(props ? { props: props.value } : {}),
    folded: state.folded || model.folded || (props?.folded ?? false),
    workers: statuses(instance.address).map(({ name, key, status }) => ({
      name,
      key,
      status,
    })),
  };
};

const none: Statuses = () => [];

export const lookAt = (app: AppRuntime, { at, open }: LookAsked) =>
  Effect.gen(function* () {
    const runtime = yield* runtimeOf(app);
    const { actor } = runtime;
    const { history } = app;
    const { id, step } = yield* resolve(history, at);
    const { snapshot, changes } = yield* replayed(
      history,
      step,
      (): {
        readonly snapshot: Snapshot;
        readonly changes: ReadonlyMap<string, Change>;
      } => {
        const entry = id === null ? undefined : History.entry(history, id);
        if (!entry)
          return {
            snapshot: History.snapshot(actor, history, id),
            changes: new Map(),
          };
        const { before, after } = playedOf(actor, history, entry);
        return { snapshot: after, changes: changesOf(before, after) };
      },
    );
    const instances = instancesOf(snapshot);
    const byAddress = new Map<string, Instance>(
      instances.map((one) => [one.address, one]),
    );
    const missing = open.find((address) => !byAddress.has(address));
    if (missing !== undefined)
      return yield* new InstanceNotFound({
        instance: missing,
        at: step,
        available: instances.map((one) => one.address),
      });
    const statuses: Statuses =
      id === history.head && runtime.running
        ? (address) => runtime.at(address as Address)?.workers ?? []
        : none;
    const look: Look = {
      at: step,
      root: lookedOf(snapshot.root, changes),
      opened: Object.fromEntries(
        open.map((address) => [
          address,
          openedOf(byAddress.get(address)!, actor.blueprint, statuses),
        ]),
      ),
    };
    return look;
  });
