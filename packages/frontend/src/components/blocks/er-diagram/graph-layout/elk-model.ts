import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';

import type { presentSnapshot } from '../relationship-presentation';

type Presentation = ReturnType<typeof presentSnapshot>;
type PresentedEntity = Presentation['entities'][number];

export const entityWidth = 292;
export const headerHeight = 50;
export const fieldHeight = 34;
export const externalHeight = 78;

export function entityHeight(entity: PresentedEntity): number {
  return entity.external
    ? externalHeight
    : headerHeight + Math.max(1, entity.fields.length) * fieldHeight;
}

export function toElkGraph(presentation: Presentation): ElkNode {
  const edges: ElkExtendedEdge[] = presentation.relationships.map(
    (relationship) => ({
      id: relationship.id,
      sources: [relationship.source],
      targets: [relationship.target],
    }),
  );

  return {
    id: presentation.id,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'GREEDY_MODEL_ORDER',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.spacing.edgeNodeBetweenLayers': '48',
      'elk.spacing.edgeNode': '28',
      'elk.spacing.nodeNode': '56',
      'elk.layered.spacing.nodeNodeBetweenLayers': '112',
      'elk.padding': '[top=32,left=32,bottom=32,right=32]',
    },
    children: presentation.entities.map((entity) => ({
      id: entity.id,
      width: entityWidth,
      height: entityHeight(entity),
    })),
    edges,
  };
}
