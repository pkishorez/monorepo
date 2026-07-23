import { markdown, projectNarrative, type ProjectNarrativeDef } from 'laymos';

export function createStdToolkitProjectNarrative(): ProjectNarrativeDef {
  return projectNarrative(
    'std-toolkit',
    markdown`
      # A typed foundation for application data

      \`std-toolkit\` collects the data primitives used by the rest of the
      monorepo. Its DynamoDB module turns schemas into a consistent persistence
      surface: callers work with decoded domain values while the module owns
      keys, conditions, version upgrades, pagination, and soft deletion.

      ## DynamoDB data model

      The DynamoDB data model owns the contract between typed application
      entities and DynamoDB. Public services expose domain operations while
      generated metadata and expressions keep storage details consistent.

      ### Entity collections

      Entity collections model many keyed records of one entity type. They
      cover creation, reads, conditional mutation, soft deletion, restoration,
      and batch writes.

      Query and pagination read ordered entity ranges through explicit key
      bounds. Callers can request one page or consume a stream that continues
      until the range is exhausted.

      ### Single entities

      Single entities model a schema that owns exactly one record rather than a
      keyed collection. Their smaller API preserves the same decoding,
      conditional-update, and reset guarantees.

      ## How to read the Stories

      Each Story begins with authored documentation and then shows the
      structural narrative collected from production-shaped code. Scenarios
      narrow that structure to concrete observable cases. Switch to **Graph**
      when you want to inspect branching, terminals, and Scenario coverage.
    `,
  );
}
