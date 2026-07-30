import { toDirectedGraph } from 'xstate-v6/graph';
import type { AnyStateMachine } from 'xstate-v6';

import type { SerializedStateMachine } from '../../types';
import { toDelayMap } from '../delays';
import { serializeDirectedGraph } from '../serialize-graph';
import { getChoiceBranches } from './choice-branches';

export function serializeV6(machine: AnyStateMachine): SerializedStateMachine {
  const graph = toDirectedGraph(machine);

  return serializeDirectedGraph(graph, {
    choiceBranches: getChoiceBranches(graph, machine),
    delays: toDelayMap(machine.implementations.delays),
  });
}
