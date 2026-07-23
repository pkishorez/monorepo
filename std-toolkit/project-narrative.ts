import {
  markdown,
  projectMap,
  projectNarrative,
  topic,
  type Layer,
  type LayerGraph,
  type ModuleDef,
  type ProjectNarrativeDef,
} from 'laymos';

interface StdToolkitProjectNarrativeOptions {
  readonly dynamodbGraph: LayerGraph;
  readonly dynamodbServicesLayer: Layer;
  readonly dynamodbServicesModule: ModuleDef;
}

export function createStdToolkitProjectNarrative({
  dynamodbGraph,
  dynamodbServicesLayer,
  dynamodbServicesModule,
}: StdToolkitProjectNarrativeOptions): ProjectNarrativeDef {
  return projectNarrative('std-toolkit', [
    markdown`
      # A typed foundation for application data

      \`std-toolkit\` collects the data primitives used by the rest of the
      monorepo. Its DynamoDB module turns schemas into a consistent persistence
      surface: callers work with decoded domain values while the module owns
      keys, conditions, version upgrades, pagination, and soft deletion.

      The map below describes responsibilities rather than runtime execution.
      Select a part to understand its boundary and open the executable stories
      that demonstrate its behavior.
    `,

    projectMap(
      topic('DynamoDB data model', {
        description: markdown`
          Owns the contract between typed application entities and DynamoDB.
          Public services expose domain operations while generated metadata and
          expressions keep storage details consistent.
        `,
        references: [dynamodbGraph],
        children: [
          topic('Entity collections', {
            description: markdown`
              Models many keyed records of one entity type. This responsibility
              covers creation, reads, conditional mutation, soft deletion,
              restoration, and batch writes.
            `,
            references: [dynamodbServicesLayer, dynamodbServicesModule],
            children: [
              topic('Query and pagination', {
                description: markdown`
                  Reads ordered entity ranges through explicit key bounds.
                  Callers can request one page or consume a stream that continues
                  until the range is exhausted.
                `,
                references: [dynamodbServicesModule],
              }),
            ],
          }),
          topic('Single entities', {
            description: markdown`
              Models a schema that owns exactly one record rather than a keyed
              collection. Its smaller API preserves the same decoding,
              conditional-update, and reset guarantees.
            `,
            references: [dynamodbServicesModule],
          }),
        ],
      }),
    ),

    markdown`
      ## How to read the stories

      Each story begins with authored documentation and then shows the structural
      narrative collected from production-shaped code. Scenarios narrow that
      structure to concrete observable cases. Switch to **Graph** when you want
      to inspect branching, terminals, and scenario coverage.
    `,
  ]);
}
