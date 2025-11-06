import { Schema } from 'effect';
import { Node, Edge } from '@xyflow/react';
import { inspectSchema } from './inspect';

type SchemaInspection = ReturnType<typeof inspectSchema>;

/**
 * Converts a schema inspection to a ReactFlow node
 */
export function inspectionToNode(
  id: string,
  label: string,
  inspection: SchemaInspection,
  position: { x: number; y: number },
): Node {
  return {
    id,
    type: 'databaseSchema',
    position,
    data: {
      label,
      schema: inspection.properties.map((prop) => ({
        title: String(prop.name),
        type: getTypeDisplay(prop),
      })),
    },
  };
}

/**
 * Gets a human-readable type display for a property
 */
function getTypeDisplay(prop: SchemaInspection['properties'][number]): string {
  // If it's a literal union (like enum), show the literals
  if (prop.unionLiterals && prop.unionLiterals.length > 0) {
    return 'enum';
  }

  // If it has a brand, show the brand name
  if (prop.brands && prop.brands.length > 0) {
    return 'uuid';
  }

  // Map common Effect Schema types to SQL types
  const typeMap: Record<string, string> = {
    StringKeyword: 'varchar',
    NumberKeyword: 'numeric',
    BooleanKeyword: 'boolean',
    Refinement: 'int4', // For refined numbers like integers
  };

  return typeMap[prop.typeTag] || prop.typeTag.toLowerCase();
}

/**
 * Detects edges between schemas based on matching brands
 */
export function detectEdgesByBrand(
  schemas: Array<{ id: string; inspection: SchemaInspection }>,
): Edge[] {
  const edges: Edge[] = [];

  // Build a map of brand -> schemas that have properties with that brand
  const brandMap = new Map<
    string | symbol,
    Array<{ schemaId: string; propertyName: string }>
  >();

  // First pass: collect all branded properties
  schemas.forEach(({ id, inspection }) => {
    inspection.properties.forEach((prop) => {
      if (prop.brands && prop.brands.length > 0) {
        prop.brands.forEach((brand) => {
          if (!brandMap.has(brand)) {
            brandMap.set(brand, []);
          }
          brandMap.get(brand)!.push({
            schemaId: id,
            propertyName: String(prop.name),
          });
        });
      }
    });
  });

  // Second pass: create edges for matching brands
  brandMap.forEach((properties) => {
    // We need at least 2 properties with the same brand to create edges
    if (properties.length < 2) return;

    // Find the "primary" property (usually named 'id')
    const primaryProp = properties.find((p) => p.propertyName === 'id');

    if (!primaryProp) return;

    // Create edges from foreign keys to the primary key
    properties.forEach((foreignProp) => {
      if (
        foreignProp.schemaId !== primaryProp.schemaId ||
        foreignProp.propertyName !== primaryProp.propertyName
      ) {
        edges.push({
          id: `${foreignProp.schemaId}-${foreignProp.propertyName}-${primaryProp.schemaId}-${primaryProp.propertyName}`,
          source: foreignProp.schemaId,
          target: primaryProp.schemaId,
          sourceHandle: foreignProp.propertyName,
          targetHandle: primaryProp.propertyName,
        });
      }
    });
  });

  return edges;
}

/**
 * Main function to build flow data from schemas
 */
export function buildFlowData(
  schemas: Record<string, Schema.Schema<any, any, any>>,
  positions?: Record<string, { x: number; y: number }>,
): { nodes: Node[]; edges: Edge[] } {
  const schemaEntries = Object.entries(schemas);

  // Default positions if not provided
  const defaultPositions: Record<string, { x: number; y: number }> = {
    Products: { x: 0, y: 0 },
    Warehouses: { x: 350, y: -100 },
    Suppliers: { x: 350, y: 200 },
  };

  // Inspect all schemas
  const inspections = schemaEntries.map(([name, schema]) => ({
    id: name.toLowerCase(),
    name,
    inspection: inspectSchema(schema),
  }));

  // Convert to nodes
  const nodes = inspections.map(({ id, name, inspection }) =>
    inspectionToNode(
      id,
      name,
      inspection,
      positions?.[name] || defaultPositions[name] || { x: 0, y: 0 },
    ),
  );

  // Detect edges
  const edges = detectEdgesByBrand(
    inspections.map(({ id, inspection }) => ({ id, inspection })),
  );

  return { nodes, edges };
}
