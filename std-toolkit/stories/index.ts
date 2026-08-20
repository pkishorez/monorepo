import { Story } from 'laymos/story';

import { addAField } from './evolving-schema/defining-evolutions/add-a-field.story.js';
import { removeAField } from './evolving-schema/defining-evolutions/remove-a-field.story.js';
import { renameAField } from './evolving-schema/defining-evolutions/rename-a-field.story.js';
import { sequentialVersions } from './evolving-schema/defining-evolutions/sequential-versions.story.js';
import { reservedUnderscore } from './evolving-schema/defining-evolutions/reserved-underscore.story.js';
import { noOptionalFields } from './evolving-schema/defining-evolutions/no-optional-fields.story.js';
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
import { aTableToPutNotesIn } from './database/std-table/building-the-notebook/a-table-to-put-notes-in.story.js';
import { whereANoteLives } from './database/std-table/building-the-notebook/where-a-note-lives.story.js';
import { aSecondWayToRead } from './database/std-table/building-the-notebook/a-second-way-to-read.story.js';
import { theNotebookWeBuilt } from './database/std-table/building-the-notebook/the-notebook-we-built.story.js';
import { reservedNames } from './database/std-table/defining-a-table/reserved-names.story.js';
import { topologyLimits } from './database/std-table/defining-a-table/topology-limits.story.js';
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
import { refusingAnUpdate } from './database/std-table/transactions/refusing-an-update.story.js';
import { codecFields } from './database/std-table/encoded-and-decoded/codec-fields.story.js';
import { olderRows } from './database/std-table/evolving-data-in-place/older-rows.story.js';
import { unreadableRows } from './database/std-table/evolving-data-in-place/unreadable-rows.story.js';

import { aBackendAndNobodyWatching } from './sync/building-the-simulation/a-backend-and-nobody-watching.story.js';
import { aBrowserMountsAQuery } from './sync/building-the-simulation/a-browser-mounts-a-query.story.js';
import { twoBrowsersOneBackend } from './sync/building-the-simulation/two-browsers-one-backend.story.js';
import { theVocabularyWeBuilt } from './sync/building-the-simulation/the-vocabulary-we-built.story.js';
import { fromDatabaseToCollection } from './sync/wiring-a-collection/from-database-to-collection.story.js';
import { aUserUpdatedSomeTimeBack } from './sync/catching-up/a-user-updated-some-time-back.story.js';
import { editsKeepFlowing } from './sync/catching-up/edits-keep-flowing.story.js';
import { oneListAtATime } from './sync/syncing-on-demand/one-list-at-a-time.story.js';
import { crossCollection } from './sync/optimistic-transactions/cross-collection.story.js';
import { peerSyncModel } from './sync/two-tabs/peer-sync-model.story.js';
import { oneBrowserManyTabs } from './sync/two-tabs/one-browser-many-tabs.story.js';
import { oneReaderManyTabs } from './sync/leadership/one-reader-many-tabs.story.js';
import { yieldingLeadership } from './sync/leadership/yielding-leadership.story.js';
import { leadershipIsNotACache } from './sync/leadership/leadership-is-not-a-cache.story.js';

import { batchInsert } from './database/dynamodb/batch-insert.story.js';
import { nativeUpdates } from './database/dynamodb/native-updates.story.js';
import { consistentReads } from './database/dynamodb/consistent-reads.story.js';
import { tableDefinition } from './database/dynamodb/table-definition.story.js';
import { goingFullyNative } from './database/dynamodb/going-fully-native.story.js';
import { autoVersionedSetup } from './database/idb/auto-versioned-setup.story.js';
import { livingInTheBrowser } from './database/idb/living-in-the-browser.story.js';
import { fourDriversOneTable } from './database/sqlite/four-drivers-one-table.story.js';
import { writeYourOwnDriver } from './database/sqlite/write-your-own-driver.story.js';

export default Story.group(
  'std-toolkit',
  {
    description:
      'A notebook, built three times over: its data given a shape that can change, a table to keep it in, and a way to keep every open tab agreed on it.',
  },
  [
    Story.group(
      'Learn',
      {
        description:
          'The path through std-toolkit, front to back. Three parts, each starting where the one before it stopped.',
      },
      [
        Story.group(
          'Evolving Schema',
          {
            description:
              'Part one. A Note grows new fields, loses old ones, and renames one — and every note already written keeps working.',
          },
          [
            Story.group(
              'Defining evolutions',
              {
                description:
                  'The ladder, built one rung per Story, ending with the Note every later part uses.',
              },
              [
                addAField,
                removeAField,
                renameAField,
                sequentialVersions,
                reservedUnderscore,
              ],
            ),
            Story.group(
              'Reading old notes',
              {
                description:
                  'What happens on the way out of storage, and how far up the ladder each note has to climb.',
              },
              [oldRowAutoMigrates, migrationChain],
            ),
            Story.group(
              'Writing notes back',
              {
                description:
                  'Every write lands at the latest version — and migrations never run in this direction.',
              },
              [encodeWritesLatest, encodeOldShape, transformedFields],
            ),
            Story.group(
              'Values, not objects',
              {
                description:
                  'A setting is one bare value with nowhere to keep a version stamp, so storage gives it an envelope.',
              },
              [
                evolveAValue,
                bareValue,
                envelopeMigrates,
                adoptExistingSchema,
                valueWithVersionKey,
              ],
            ),
            Story.group(
              'Entities have identity',
              {
                description:
                  'One field names the note, and the ladder is not allowed to touch it.',
              },
              [entityIdField],
            ),
          ],
        ),
        Story.group(
          'Database',
          {
            description:
              'Part two. The Note from part one gets somewhere to live — one table shape that behaves the same on four different databases.',
          },
          [
            Story.group(
              'How these stories run',
              {
                description:
                  'Four databases, one program, and the harness that makes them answer together.',
              },
              [fourAdapters, freshDatabases, layerSelection, theSharedTable],
            ),
            Story.group(
              'Building the notebook',
              {
                description:
                  'Four Stories that assemble the table every later Story uses — and prove, at the end, that they built it.',
              },
              [
                aTableToPutNotesIn,
                whereANoteLives,
                aSecondWayToRead,
                theNotebookWeBuilt,
              ],
            ),
            Story.group(
              'More than one entity',
              {
                description:
                  'A notebook holds more than notes: an entity with exactly one row, and two entities sharing one table.',
              },
              [singleEntities, sharingOneTable],
            ),
            Story.group(
              'Writing & reading',
              {
                description:
                  'Putting a note in, taking it back out, and what a delete really does to it.',
              },
              [insertARow, deletingAndRestoring, hardDelete],
            ),
            Story.group(
              'Updating safely',
              {
                description:
                  'Changing part of a note without reading the whole thing into your own code first.',
              },
              [partialUpdates, skippingAndMissing, keysAreImmutable],
            ),
            Story.group(
              'Querying',
              {
                description:
                  'Reading a notebook rather than a note: naming a slice of a partition.',
              },
              [listingAPartition, sortConditions, prefixMatching],
            ),
            Story.group(
              'Pagination',
              {
                description:
                  'Results come in pages whether you ask for them or not, and resuming needs no cursor.',
              },
              [pageSize, resumingAQuery, tombstonesAndTies],
            ),
            Story.group(
              'Access patterns & indexes',
              {
                description:
                  'Asking the same table a different question, and what happens to rows that cannot answer it.',
              },
              [secondaryPatterns, sparseIndexes],
            ),
            Story.group(
              'Transactions',
              {
                description:
                  'Several writes that land together, and the checks that can stop all of them.',
              },
              [atomicWrites, staleOps, checkOps, refusingAnUpdate],
            ),
            Story.group(
              'Encoded & decoded values',
              {
                description:
                  'Dates go in as dates and come back as dates; the encoding happens at the adapter.',
              },
              [codecFields],
            ),
            Story.group(
              'Evolving data in place',
              {
                description:
                  "Part one's ladder, now running inside a read — with nothing rewritten in storage.",
              },
              [olderRows],
            ),
          ],
        ),
        Story.group(
          'Sync',
          {
            description:
              'Part three. The table from part two reaches the browser, and every open tab is kept agreed on what it holds.',
          },
          [
            Story.group(
              'Building the simulation',
              {
                description:
                  'Four Stories that assemble the world the rest of this part runs in — and prove, at the end, that they built it.',
              },
              [
                aBackendAndNobodyWatching,
                aBrowserMountsAQuery,
                twoBrowsersOneBackend,
                theVocabularyWeBuilt,
              ],
            ),
            Story.group(
              'Wiring a collection',
              {
                description:
                  'The first note to make the trip from the backend to a mounted query, and back again.',
              },
              [fromDatabaseToCollection],
            ),
            Story.group(
              'Catching up',
              {
                description:
                  'A browser that has been away finds history waiting for it.',
              },
              [aUserUpdatedSomeTimeBack, editsKeepFlowing],
            ),
            Story.group(
              'Syncing on demand',
              {
                description:
                  'Only the partition a mounted query actually asks for is activated.',
              },
              [oneListAtATime],
            ),
            Story.group(
              'Optimistic transactions',
              {
                description:
                  'Two collections changed at once, shown immediately and confirmed together.',
              },
              [crossCollection],
            ),
            Story.group(
              'Many tabs',
              {
                description:
                  'A second tab opens. Where does what it shows come from?',
              },
              [oneBrowserManyTabs, peerSyncModel],
            ),
            Story.group(
              'Leadership',
              {
                description:
                  'Many tabs, one reader — who holds it, how it is handed over, and what it is not.',
              },
              [oneReaderManyTabs, yieldingLeadership, leadershipIsNotACache],
            ),
          ],
        ),
      ],
    ),
    Story.group(
      'Reference',
      {
        description:
          'Everything the path deliberately walks past: the rules, the failures, the limits, and the database-specific escape hatches.',
      },
      [
        Story.group(
          'Schema rules & failures',
          {
            description:
              'What a schema refuses to accept, and how it refuses it.',
          },
          [
            noOptionalFields,
            missingVersionStamp,
            unknownVersion,
            malformedPayload,
          ],
        ),
        Story.group(
          'Breaking changes',
          {
            description:
              'The three ways to break notes already written, and the snapshot that catches them.',
          },
          [editingShippedVersion, changingShippedMigration, snapshotGuard],
        ),
        Story.group(
          'Migration practice',
          {
            description:
              'The habits that keep a ladder safe to climb years after it was built.',
          },
          [
            appendDontMutate,
            totalMigrations,
            pureMigrations,
            makePartialValidates,
          ],
        ),
        Story.group(
          'Table limits & failures',
          {
            description:
              'The table shapes, keys, queries, and batches that are refused rather than accepted.',
          },
          [
            reservedNames,
            topologyLimits,
            indexComponents,
            invalidQueries,
            transactionLimits,
            unreadableRows,
          ],
        ),
        Story.group(
          'DynamoDB',
          {
            description:
              'What DynamoDB can do that the portable surface deliberately does not expose.',
          },
          [
            batchInsert,
            nativeUpdates,
            consistentReads,
            tableDefinition,
            goingFullyNative,
          ],
        ),
        Story.group(
          'IndexedDB',
          {
            description:
              'Living in a browser: version arithmetic, and tabs that have to cooperate.',
          },
          [autoVersionedSetup, livingInTheBrowser],
        ),
        Story.group(
          'SQLite',
          {
            description:
              'One embedded engine, four runtimes, behind a three-method seam you can implement yourself.',
          },
          [fourDriversOneTable, writeYourOwnDriver],
        ),
      ],
    ),
  ],
);
