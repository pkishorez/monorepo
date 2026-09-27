import type {
  ElkExtendedEdge,
  ElkNode,
  ElkPort,
} from 'elkjs/lib/elk.bundled.js';

import type { presentSnapshot } from '../relationship-presentation';

type Presentation = ReturnType<typeof presentSnapshot>;
type PresentedEntity = Presentation['entities'][number];

export const entityWidth = 292;
export const headerHeight = 50;
export const fieldHeight = 34;
export const externalHeight = 78;
const portSize = 1;

export function entityHeight(entity: PresentedEntity): number {
  return entity.external
    ? externalHeight
    : headerHeight + Math.max(1, entity.fields.length) * fieldHeight;
}

function sourcePortId(entityId: string, fieldName: string): string {
  return `${entityId}:source:${fieldName}`;
}

function targetPortId(
  entityId: string,
  fieldName: string | null,
  selfReference: boolean,
): string {
  return `${entityId}:target:${selfReference ? 'self:' : ''}${fieldName ?? 'external'}`;
}

function port(
  id: string,
  side: 'EAST' | 'WEST',
  y: number,
  index: number,
): ElkPort {
  return {
    id,
    x: side === 'EAST' ? entityWidth - portSize : 0,
    y: y - portSize / 2,
    width: portSize,
    height: portSize,
    layoutOptions: {
      'elk.port.side': side,
      'elk.port.index': String(index),
    },
  };
}

function portsFor(
  entity: PresentedEntity,
  presentation: Presentation,
): ElkPort[] {
  const sourceFields = new Set(
    presentation.relationships
      .filter((relationship) => relationship.source === entity.id)
      .map((relationship) => relationship.sourceField),
  );
  const ports: ElkPort[] = entity.fields.flatMap((field, index) =>
    sourceFields.has(field.name)
      ? [
          port(
            sourcePortId(entity.id, field.name),
            'EAST',
            headerHeight + index * fieldHeight + fieldHeight / 2,
            index,
          ),
        ]
      : [],
  );

  const targets = new Map<string, { field: string | null; self: boolean }>();
  for (const relationship of presentation.relationships) {
    if (relationship.target !== entity.id) continue;
    const self = relationship.source === relationship.target;
    const id = targetPortId(entity.id, relationship.targetField, self);
    targets.set(id, { field: relationship.targetField, self });
  }
  for (const [id, target] of targets) {
    const fieldIndex =
      target.field === null
        ? -1
        : entity.fields.findIndex((field) => field.name === target.field);
    const y =
      entity.external || fieldIndex < 0
        ? entityHeight(entity) / 2
        : headerHeight + fieldIndex * fieldHeight + fieldHeight / 2;
    ports.push(
      port(id, target.self ? 'EAST' : 'WEST', y, Math.max(0, fieldIndex)),
    );
  }
  return ports;
}

export function toElkGraph(presentation: Presentation): ElkNode {
  const edges: ElkExtendedEdge[] = presentation.relationships.map(
    (relationship) => ({
      id: relationship.id,
      sources: [sourcePortId(relationship.source, relationship.sourceField)],
      targets: [
        targetPortId(
          relationship.target,
          relationship.targetField,
          relationship.source === relationship.target,
        ),
      ],
    }),
  );

  return {
    id: presentation.id,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.considerModelOrder.strategy': 'PREFER_NODES',
      'elk.layered.considerModelOrder.portModelOrder': 'true',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.layered.spacing.edgeNodeBetweenLayers': '48',
      'elk.spacing.edgeNode': '28',
      'elk.spacing.nodeNode': '56',
      'elk.spacing.componentComponent': '72',
      'elk.layered.spacing.nodeNodeBetweenLayers': '112',
      'elk.aspectRatio': '1.6',
      'elk.padding': '[top=32,left=32,bottom=32,right=32]',
    },
    children: presentation.entities.map((entity) => ({
      id: entity.id,
      width: entityWidth,
      height: entityHeight(entity),
      ports: portsFor(entity, presentation),
      layoutOptions: {
        'elk.portConstraints': 'FIXED_POS',
      },
    })),
    edges,
  };
}
