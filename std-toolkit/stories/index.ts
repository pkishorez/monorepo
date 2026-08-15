import { Story } from 'laymos/story';

import { addAField } from './evolving-schema/defining-evolutions/add-a-field.story.js';
import { removeAField } from './evolving-schema/defining-evolutions/remove-a-field.story.js';
import { renameAField } from './evolving-schema/defining-evolutions/rename-a-field.story.js';
import { sequentialVersions } from './evolving-schema/defining-evolutions/sequential-versions.story.js';
import { noOptionalFields } from './evolving-schema/defining-evolutions/no-optional-fields.story.js';
import { reservedUnderscore } from './evolving-schema/defining-evolutions/reserved-underscore.story.js';
import { oldRowAutoMigrates } from './evolving-schema/decoding-scenarios/old-row-auto-migrates.story.js';
import { migrationChain } from './evolving-schema/decoding-scenarios/migration-chain.story.js';
import { missingVersionStamp } from './evolving-schema/decoding-scenarios/missing-version-stamp.story.js';
import { unknownVersion } from './evolving-schema/decoding-scenarios/unknown-version.story.js';
import { malformedPayload } from './evolving-schema/decoding-scenarios/malformed-payload.story.js';
import { encodeWritesLatest } from './evolving-schema/encoding-scenarios/encode-writes-latest.story.js';
import { encodeOldShape } from './evolving-schema/encoding-scenarios/encode-old-shape.story.js';
import { transformedFields } from './evolving-schema/encoding-scenarios/transformed-fields.story.js';
import { editingShippedVersion } from './evolving-schema/corruption-and-breaking-changes/editing-shipped-version.story.js';
import { changingShippedMigration } from './evolving-schema/corruption-and-breaking-changes/changing-shipped-migration.story.js';
import { snapshotGuard } from './evolving-schema/corruption-and-breaking-changes/snapshot-guard.story.js';
import { evolveAValue } from './evolving-schema/value-eschema/evolve-a-value.story.js';
import { adoptExistingSchema } from './evolving-schema/value-eschema/adopt-existing-schema.story.js';
import { bareValue } from './evolving-schema/value-eschema/bare-value.story.js';
import { envelopeMigrates } from './evolving-schema/value-eschema/envelope-migrates.story.js';
import { valueWithVersionKey } from './evolving-schema/value-eschema/value-with-version-key.story.js';
import { entityIdField } from './evolving-schema/entity-eschema/entity-id-field.story.js';
import { appendDontMutate } from './evolving-schema/gotchas-and-best-practices/append-dont-mutate.story.js';
import { totalMigrations } from './evolving-schema/gotchas-and-best-practices/total-migrations.story.js';
import { pureMigrations } from './evolving-schema/gotchas-and-best-practices/pure-migrations.story.js';
import { makePartialValidates } from './evolving-schema/gotchas-and-best-practices/make-partial.story.js';

import { threeRealBackends } from './std-table/how-these-stories-run/three-real-backends.story.js';
import { freshDatabases } from './std-table/how-these-stories-run/fresh-databases.story.js';
import { theSharedTable } from './std-table/how-these-stories-run/the-shared-table.story.js';
import { shapeOfATable } from './std-table/defining-a-table/shape-of-a-table.story.js';
import { reservedNames } from './std-table/defining-a-table/reserved-names.story.js';
import { topologyLimits } from './std-table/defining-a-table/topology-limits.story.js';
import { keyedEntities } from './std-table/binding-entities/keyed-entities.story.js';
import { indexComponents } from './std-table/binding-entities/index-components.story.js';
import { singleEntities } from './std-table/binding-entities/single-entities.story.js';
import { sharingOneTable } from './std-table/binding-entities/sharing-one-table.story.js';
import { insertARow } from './std-table/writing-and-reading/insert-a-row.story.js';
import { deletingAndRestoring } from './std-table/writing-and-reading/deleting-and-restoring.story.js';
import { hardDelete } from './std-table/writing-and-reading/hard-delete.story.js';
import { partialUpdates } from './std-table/updating-safely/partial-updates.story.js';
import { skippingAndMissing } from './std-table/updating-safely/skipping-and-missing.story.js';
import { keysAreImmutable } from './std-table/updating-safely/keys-are-immutable.story.js';
import { listingAPartition } from './std-table/querying/listing-a-partition.story.js';
import { sortConditions } from './std-table/querying/sort-conditions.story.js';
import { prefixMatching } from './std-table/querying/prefix-matching.story.js';
import { invalidQueries } from './std-table/querying/invalid-queries.story.js';
import { pageSize } from './std-table/pagination/page-size.story.js';
import { resumingAQuery } from './std-table/pagination/resuming-a-query.story.js';
import { tombstonesAndTies } from './std-table/pagination/tombstones-and-ties.story.js';
import { secondaryPatterns } from './std-table/access-patterns-and-indexes/secondary-patterns.story.js';
import { sparseIndexes } from './std-table/access-patterns-and-indexes/sparse-indexes.story.js';
import { atomicWrites } from './std-table/transactions/atomic-writes.story.js';
import { transactionLimits } from './std-table/transactions/transaction-limits.story.js';
import { staleOps } from './std-table/transactions/stale-ops.story.js';
import { olderRows } from './std-table/evolving-data-in-place/older-rows.story.js';
import { unreadableRows } from './std-table/evolving-data-in-place/unreadable-rows.story.js';

export default Story.group('std-toolkit', [
  Story.group('Std Table', [
    Story.group('How these stories run', [
      threeRealBackends,
      freshDatabases,
      theSharedTable,
    ]),
    Story.group('Defining a table', [
      shapeOfATable,
      reservedNames,
      topologyLimits,
    ]),
    Story.group('Binding entities', [
      keyedEntities,
      indexComponents,
      singleEntities,
      sharingOneTable,
    ]),
    Story.group('Writing & reading', [
      insertARow,
      deletingAndRestoring,
      hardDelete,
    ]),
    Story.group('Updating safely', [
      partialUpdates,
      skippingAndMissing,
      keysAreImmutable,
    ]),
    Story.group('Querying', [
      listingAPartition,
      sortConditions,
      prefixMatching,
      invalidQueries,
    ]),
    Story.group('Pagination', [pageSize, resumingAQuery, tombstonesAndTies]),
    Story.group('Access patterns & indexes', [
      secondaryPatterns,
      sparseIndexes,
    ]),
    Story.group('Transactions', [atomicWrites, transactionLimits, staleOps]),
    Story.group('Evolving data in place', [olderRows, unreadableRows]),
  ]),
  Story.group('Evolving Schema', [
    Story.group('Defining evolutions', [
      addAField,
      removeAField,
      renameAField,
      sequentialVersions,
      noOptionalFields,
      reservedUnderscore,
    ]),
    Story.group('Decoding scenarios', [
      oldRowAutoMigrates,
      migrationChain,
      missingVersionStamp,
      unknownVersion,
      malformedPayload,
    ]),
    Story.group('Encoding scenarios', [
      encodeWritesLatest,
      encodeOldShape,
      transformedFields,
    ]),
    Story.group('Corruption & breaking changes', [
      editingShippedVersion,
      changingShippedMigration,
      snapshotGuard,
    ]),
    Story.group('Value ESchema', [
      evolveAValue,
      adoptExistingSchema,
      bareValue,
      envelopeMigrates,
      valueWithVersionKey,
    ]),
    Story.group('Entity ESchema', [entityIdField]),
    Story.group('Gotchas & best practices', [
      appendDontMutate,
      totalMigrations,
      pureMigrations,
      makePartialValidates,
    ]),
  ]),
]);
