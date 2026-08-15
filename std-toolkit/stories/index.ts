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

import { fourAdapters } from './database/std-table/how-these-stories-run/four-adapters.story.js';
import { freshDatabases } from './database/std-table/how-these-stories-run/fresh-databases.story.js';
import { layerSelection } from './database/std-table/how-these-stories-run/layer-selection.story.js';
import { theSharedTable } from './database/std-table/how-these-stories-run/the-shared-table.story.js';
import { shapeOfATable } from './database/std-table/defining-a-table/shape-of-a-table.story.js';
import { reservedNames } from './database/std-table/defining-a-table/reserved-names.story.js';
import { topologyLimits } from './database/std-table/defining-a-table/topology-limits.story.js';
import { keyedEntities } from './database/std-table/binding-entities/keyed-entities.story.js';
import { indexComponents } from './database/std-table/binding-entities/index-components.story.js';
import { singleEntities } from './database/std-table/binding-entities/single-entities.story.js';
import { sharingOneTable } from './database/std-table/binding-entities/sharing-one-table.story.js';
import { insertARow } from './database/std-table/writing-and-reading/insert-a-row.story.js';
import { deletingAndRestoring } from './database/std-table/writing-and-reading/deleting-and-restoring.story.js';
import { hardDelete } from './database/std-table/writing-and-reading/hard-delete.story.js';
import { partialUpdates } from './database/std-table/updating-safely/partial-updates.story.js';
import { skippingAndMissing } from './database/std-table/updating-safely/skipping-and-missing.story.js';
import { keysAreImmutable } from './database/std-table/updating-safely/keys-are-immutable.story.js';
import { listingAPartition } from './database/std-table/querying/listing-a-partition.story.js';
import { sortConditions } from './database/std-table/querying/sort-conditions.story.js';
import { prefixMatching } from './database/std-table/querying/prefix-matching.story.js';
import { invalidQueries } from './database/std-table/querying/invalid-queries.story.js';
import { pageSize } from './database/std-table/pagination/page-size.story.js';
import { resumingAQuery } from './database/std-table/pagination/resuming-a-query.story.js';
import { tombstonesAndTies } from './database/std-table/pagination/tombstones-and-ties.story.js';
import { secondaryPatterns } from './database/std-table/access-patterns-and-indexes/secondary-patterns.story.js';
import { sparseIndexes } from './database/std-table/access-patterns-and-indexes/sparse-indexes.story.js';
import { atomicWrites } from './database/std-table/transactions/atomic-writes.story.js';
import { checkOps } from './database/std-table/transactions/check-ops.story.js';
import { transactionLimits } from './database/std-table/transactions/transaction-limits.story.js';
import { staleOps } from './database/std-table/transactions/stale-ops.story.js';
import { olderRows } from './database/std-table/evolving-data-in-place/older-rows.story.js';
import { unreadableRows } from './database/std-table/evolving-data-in-place/unreadable-rows.story.js';

import { aSimulatedWorld } from './tanstack-sync/how-these-stories-run/a-simulated-world.story.js';
import { fromDatabaseToCollection } from './tanstack-sync/wiring-a-collection/from-database-to-collection.story.js';
import { aUserUpdatedSomeTimeBack } from './tanstack-sync/catching-up/a-user-updated-some-time-back.story.js';
import { editsKeepFlowing } from './tanstack-sync/staying-current/edits-keep-flowing.story.js';
import { oneListAtATime } from './tanstack-sync/syncing-on-demand/one-list-at-a-time.story.js';
import { crossCollection } from './tanstack-sync/optimistic-transactions/cross-collection.story.js';
import { issue1 } from './tanstack-sync/issue-1/issue-1.story.js';

import { batchInsert } from './database/dynamodb/batch-insert.story.js';
import { nativeUpdates } from './database/dynamodb/native-updates.story.js';
import { consistentReads } from './database/dynamodb/consistent-reads.story.js';
import { tableDefinition } from './database/dynamodb/table-definition.story.js';
import { goingFullyNative } from './database/dynamodb/going-fully-native.story.js';
import { autoVersionedSetup } from './database/idb/auto-versioned-setup.story.js';
import { livingInTheBrowser } from './database/idb/living-in-the-browser.story.js';
import { fourDriversOneTable } from './database/sqlite/four-drivers-one-table.story.js';
import { writeYourOwnDriver } from './database/sqlite/write-your-own-driver.story.js';

export default Story.group('std-toolkit', [
  Story.group('Database', [
    Story.group('Std Table', [
      Story.group('How these stories run', [
        fourAdapters,
        freshDatabases,
        layerSelection,
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
      Story.group('Transactions', [
        atomicWrites,
        transactionLimits,
        staleOps,
        checkOps,
      ]),
      Story.group('Evolving data in place', [olderRows, unreadableRows]),
    ]),
    Story.group('DynamoDB', [
      batchInsert,
      nativeUpdates,
      consistentReads,
      tableDefinition,
      goingFullyNative,
    ]),
    Story.group('IndexedDB', [autoVersionedSetup, livingInTheBrowser]),
    Story.group('SQLite', [fourDriversOneTable, writeYourOwnDriver]),
  ]),
  Story.group('TanStack Sync', [
    Story.group('How these stories run', [aSimulatedWorld]),
    Story.group('Wiring a collection', [fromDatabaseToCollection]),
    Story.group('Catching up', [aUserUpdatedSomeTimeBack]),
    Story.group('Staying current', [editsKeepFlowing]),
    Story.group('Syncing on demand', [oneListAtATime]),
    Story.group('Optimistic transactions', [crossCollection]),
    Story.group('Issues', [issue1]),
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
