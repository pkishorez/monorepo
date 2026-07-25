import {
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import { useLayoutEffect } from 'react';

import type { ModuleGraphLayout } from '../lib/layout';

export interface FlowElements {
  readonly nodes: Node[];
  readonly edges: Edge[];
  readonly onNodesChange: OnNodesChange;
  readonly onEdgesChange: OnEdgesChange;
}

/**
 * Bridges the derived layout into xyflow's controlled store.
 *
 * The computed layout is the single source of truth. Passing `nodes`/`edges`
 * as read-only props leaves xyflow to sync them through a post-paint effect,
 * which can leave the canvas a frame behind a state change until an unrelated
 * interaction (a pan or drag) flushes it. Owning the state here and pushing
 * each new layout in a layout effect keeps xyflow in lock-step and repaints
 * selection highlights on the same commit as the click that caused them.
 */
export function useFlowElements(layout: ModuleGraphLayout): FlowElements {
  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  useLayoutEffect(() => {
    setNodes(layout.nodes);
  }, [layout.nodes, setNodes]);
  useLayoutEffect(() => {
    setEdges(layout.edges);
  }, [layout.edges, setEdges]);

  return { nodes, edges, onNodesChange, onEdgesChange };
}
