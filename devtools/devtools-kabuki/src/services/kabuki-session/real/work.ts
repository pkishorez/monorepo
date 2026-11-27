import type { Runtime } from '@kestack/kabuki';
import type { ProvideStatus, WorkerStatus } from '@kestack/kabuki/types';
import { trimmed } from '../../../server/rpc/contract/index.ts';
import type {
  Provided,
  Work,
  Worker,
} from '../../../server/rpc/session/contract/index.ts';

export const workerOf = ({
  name,
  key,
  status,
  failure,
  since,
}: WorkerStatus): Worker => ({
  name,
  key,
  status,
  ...(failure === undefined ? {} : { failure }),
  since,
});

const providedOf = ({ state, status, failure }: ProvideStatus): Provided => ({
  ...(state === undefined ? {} : { state }),
  status,
  ...(failure === undefined ? {} : { failure }),
});

export const workOf = (runtime: Runtime): Work => {
  const { instances, layer, failures, settled } = runtime.work();
  return {
    instances: Object.fromEntries(
      Object.entries(instances).map(
        ([address, { workers, commands, provides }]) => [
          address,
          {
            workers: workers.map(workerOf),
            commands: commands.map(({ name, args, since }) => ({
              name,
              args: trimmed(args),
              since,
            })),
            provides: provides.map(providedOf),
          },
        ],
      ),
    ),
    ...(layer ? { layer: providedOf(layer) } : {}),
    failures: failures.map(({ address, kind, name, key, failure, at }) => ({
      address,
      kind,
      name,
      ...(key === undefined ? {} : { key }),
      failure,
      at,
    })),
    settled,
  };
};
