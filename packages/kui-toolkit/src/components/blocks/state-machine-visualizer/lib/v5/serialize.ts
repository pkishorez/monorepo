import { toDirectedGraph } from 'xstate/graph';
import type { AnyStateMachine } from 'xstate';

import type { SerializedStateMachine } from '../../types';
import { toDelayMap } from '../delays';
import { serializeDirectedGraph } from '../serialize-graph';

export function serializeV5(machine: AnyStateMachine): SerializedStateMachine {
  return serializeDirectedGraph(toDirectedGraph(machine), {
    delays: toDelayMap(machine.implementations.delays),
  });
}
