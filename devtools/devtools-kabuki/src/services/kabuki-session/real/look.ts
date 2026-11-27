import { Effect } from 'effect';
import { History, Snapshot } from '@kestack/kabuki';
import type { Address } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import { InstanceNotFound } from '../../../server/rpc/session/contract/index.ts';
import type {
  LookAsked,
  Looked,
} from '../../../server/rpc/session/contract/index.ts';
import { blueprintAt, encodedData, keyOf } from './encode.ts';
import { askedOf, providesOf, takesOf } from './levels.ts';
import { instancesOf } from './played.ts';
import { replayed, resolve, runtimeOf } from './running.ts';
import { slotOf } from './step.ts';
import { workerOf } from './work.ts';

export const lookAt = (app: AppRuntime, { at, address }: LookAsked) =>
  Effect.gen(function* () {
    const runtime = yield* runtimeOf(app);
    const { actor } = runtime;
    const { history } = app;
    const { id, step } = yield* resolve(history, at);
    const snapshot = yield* replayed(history, step, () =>
      History.snapshot(actor, history, id),
    );
    const instances = instancesOf(snapshot);
    const instance = instances.find((one) => one.address === address);
    if (!instance)
      return yield* new InstanceNotFound({
        instance: address,
        at: step,
        available: instances.map((one) => one.address),
      });
    const print = blueprintAt(actor.blueprint, address);
    const tag = instance.state._tag;
    const live =
      id === history.head && runtime.running
        ? (runtime.at(address as Address)?.workers ?? [])
        : [];
    const { state, model, ...rest } = encodedData(instance, print);
    const key = keyOf(address);
    const looked: Looked = {
      at: step,
      address,
      actor: instance.actor,
      ...(print?.description === undefined
        ? {}
        : { description: print.description }),
      slot: slotOf(address),
      ...(key === undefined ? {} : { key }),
      state: tag,
      states: print ? Object.keys(print.state) : [tag],
      data: state,
      model,
      ...('props' in rest ? { props: rest.props } : {}),
      workers: askedOf(
        print,
        tag,
        Snapshot.workers(actor, snapshot, address as Address),
      ).map((asked) => {
        const found = live.find(
          (one) =>
            one.name === asked.name &&
            (asked.key === undefined || one.key === asked.key),
        );
        return found ? { ...asked, live: workerOf(found) } : asked;
      }),
      provides: providesOf(print, tag),
      takes: takesOf(print, tag),
    };
    return looked;
  });
