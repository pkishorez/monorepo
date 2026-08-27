import type { TableSnapshot } from 'std-toolkit/snapshot';

import { schemaFields } from './schema-fields';

export function presentSnapshot(snapshot: TableSnapshot) {
  const definitions = new Map(
    snapshot.schemas.map((definition) => [definition.identity, definition]),
  );
  const entities = snapshot.entities.map((entity) => {
    const definition = definitions.get(entity.schema);
    const version = definition?.versions.at(-1);
    return {
      id: entity.name,
      label: entity.name,
      schema: entity.schema,
      version: version?.version ?? 'unknown',
      idField: entity.idField,
      kind: entity.kind,
      external: false,
      fields: schemaFields(version?.encoded),
    } as const;
  });
  const entityNames = new Set(entities.map((entity) => entity.id));
  const externalNames = new Set<string>();

  for (const entity of entities) {
    for (const field of entity.fields) {
      if (
        field.referenceTarget !== undefined &&
        !entityNames.has(field.referenceTarget)
      ) {
        externalNames.add(field.referenceTarget);
      }
    }
  }

  const externalEntities = [...externalNames]
    .toSorted((left, right) => left.localeCompare(right))
    .map((name) => ({
      id: `external:${name}`,
      label: name,
      schema: name,
      version: 'external',
      idField: null,
      kind: 'external' as const,
      external: true,
      fields: [],
    }));
  const targetIds = new Map(entities.map((entity) => [entity.id, entity.id]));
  for (const entity of externalEntities) {
    targetIds.set(entity.label, entity.id);
  }

  const relationships = entities.flatMap((entity) =>
    entity.fields.flatMap((field) => {
      if (field.referenceTarget === undefined) return [];
      const target = targetIds.get(field.referenceTarget);
      if (target === undefined) return [];
      return [
        {
          id: `${entity.id}:${field.name}->${target}`,
          source: entity.id,
          sourceField: field.name,
          target,
          targetField:
            entities.find((candidate) => candidate.id === target)?.idField ??
            null,
        },
      ];
    }),
  );

  return {
    id: `${snapshot.logicalName}:${entities
      .map((entity) => `${entity.id}@${entity.version}`)
      .join('|')}:${relationships.map(({ id }) => id).join('|')}`,
    logicalName: snapshot.logicalName,
    entities: [...entities, ...externalEntities],
    relationships,
  } as const;
}
