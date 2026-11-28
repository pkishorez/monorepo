import type { StdToolkitSlug as Slug } from '../../../shared/index.ts';
import { page } from '../page.ts';
import type { Page } from '../page.ts';
import introduction, {
  headings as introductionHeadings,
} from './get-started/introduction/introduction.mdx';
import quickStart, {
  headings as quickStartHeadings,
} from './get-started/quick-start/quick-start.mdx';
import whyEvolvingSchema, {
  headings as whyEvolvingSchemaHeadings,
} from './evolving-schema/why-evolving-schema/why-evolving-schema.mdx';
import keepEveryVersion, {
  headings as keepEveryVersionHeadings,
} from './evolving-schema/keep-every-version/keep-every-version.mdx';
import eschema, {
  headings as eschemaHeadings,
} from './evolving-schema/eschema/eschema.mdx';
import addingAVersion, {
  headings as addingAVersionHeadings,
} from './evolving-schema/adding-a-version/adding-a-version.mdx';
import readingAndWriting, {
  headings as readingAndWritingHeadings,
} from './evolving-schema/reading-and-writing/reading-and-writing.mdx';
import entityEschema, {
  headings as entityEschemaHeadings,
} from './evolving-schema/entity-eschema/entity-eschema.mdx';
import valueEschema, {
  headings as valueEschemaHeadings,
} from './evolving-schema/value-eschema/value-eschema.mdx';
import shapesInsideShapes, {
  headings as shapesInsideShapesHeadings,
} from './evolving-schema/shapes-inside-shapes/shapes-inside-shapes.mdx';
import renameAndRemove, {
  headings as renameAndRemoveHeadings,
} from './evolving-schema/rename-and-remove/rename-and-remove.mdx';
import adoptingExistingData, {
  headings as adoptingExistingDataHeadings,
} from './evolving-schema/adopting-existing-data/adopting-existing-data.mdx';
import upgradeCheck, {
  headings as upgradeCheckHeadings,
} from './evolving-schema/upgrade-check/upgrade-check.mdx';
import gotchas, {
  headings as gotchasHeadings,
} from './evolving-schema/gotchas/gotchas.mdx';
import whatIsAnEntity, {
  headings as whatIsAnEntityHeadings,
} from './entities/what-is-an-entity/what-is-an-entity.mdx';
import keyedEntity, {
  headings as keyedEntityHeadings,
} from './entities/keyed-entity/keyed-entity.mdx';
import singleEntity, {
  headings as singleEntityHeadings,
} from './entities/single-entity/single-entity.mdx';
import subscribing, {
  headings as subscribingHeadings,
} from './entities/subscribing/subscribing.mdx';
import singleTableDesign, {
  headings as singleTableDesignHeadings,
} from './std-table/single-table-design/single-table-design.mdx';
import indexes, {
  headings as indexesHeadings,
} from './std-table/indexes/indexes.mdx';
import driftAndReindex, {
  headings as driftAndReindexHeadings,
} from './std-table/drift-and-reindex/drift-and-reindex.mdx';
import tableMode, {
  headings as tableModeHeadings,
} from './std-table/table-mode/table-mode.mdx';
import snapshot, {
  headings as snapshotHeadings,
} from './std-table/snapshot/snapshot.mdx';
import transactions, {
  headings as transactionsHeadings,
} from './std-table/transactions/transactions.mdx';
import whatIsAnAdapter, {
  headings as whatIsAnAdapterHeadings,
} from './adapters/what-is-an-adapter/what-is-an-adapter.mdx';
import memory, {
  headings as memoryHeadings,
} from './adapters/memory/memory.mdx';
import indexeddb, {
  headings as indexeddbHeadings,
} from './adapters/indexeddb/indexeddb.mdx';
import sqlite, {
  headings as sqliteHeadings,
} from './adapters/sqlite/sqlite.mdx';
import dynamodb, {
  headings as dynamodbHeadings,
} from './adapters/dynamodb/dynamodb.mdx';
import deploying, {
  headings as deployingHeadings,
} from './adapters/deploying/deploying.mdx';
import howSyncWorks, {
  headings as howSyncWorksHeadings,
} from './sync/how-sync-works/how-sync-works.mdx';
import stdSync, {
  headings as stdSyncHeadings,
} from './sync/std-sync/std-sync.mdx';
import strategies, {
  headings as strategiesHeadings,
} from './sync/strategies/strategies.mdx';
import acrossTabs, {
  headings as acrossTabsHeadings,
} from './sync/across-tabs/across-tabs.mdx';
import pacedUpdates, {
  headings as pacedUpdatesHeadings,
} from './sync/paced-updates/paced-updates.mdx';
import replica, {
  headings as replicaHeadings,
} from './sync/replica/replica.mdx';

/*
 * Every written std-toolkit docs page, by slug. A slug in the table of
 * contents with no page here does not compile.
 */

export const STD_TOOLKIT: Record<Slug, Page> = {
  introduction: page(introduction, introductionHeadings),
  'quick-start': page(quickStart, quickStartHeadings),
  'why-evolving-schema': page(whyEvolvingSchema, whyEvolvingSchemaHeadings),
  'keep-every-version': page(keepEveryVersion, keepEveryVersionHeadings),
  eschema: page(eschema, eschemaHeadings),
  'adding-a-version': page(addingAVersion, addingAVersionHeadings),
  'reading-and-writing': page(readingAndWriting, readingAndWritingHeadings),
  'entity-eschema': page(entityEschema, entityEschemaHeadings),
  'value-eschema': page(valueEschema, valueEschemaHeadings),
  'shapes-inside-shapes': page(shapesInsideShapes, shapesInsideShapesHeadings),
  'rename-and-remove': page(renameAndRemove, renameAndRemoveHeadings),
  'adopting-existing-data': page(
    adoptingExistingData,
    adoptingExistingDataHeadings,
  ),
  'upgrade-check': page(upgradeCheck, upgradeCheckHeadings),
  gotchas: page(gotchas, gotchasHeadings),
  'what-is-an-entity': page(whatIsAnEntity, whatIsAnEntityHeadings),
  'keyed-entity': page(keyedEntity, keyedEntityHeadings),
  'single-entity': page(singleEntity, singleEntityHeadings),
  subscribing: page(subscribing, subscribingHeadings),
  'single-table-design': page(singleTableDesign, singleTableDesignHeadings),
  indexes: page(indexes, indexesHeadings),
  'drift-and-reindex': page(driftAndReindex, driftAndReindexHeadings),
  'table-mode': page(tableMode, tableModeHeadings),
  snapshot: page(snapshot, snapshotHeadings),
  transactions: page(transactions, transactionsHeadings),
  'what-is-an-adapter': page(whatIsAnAdapter, whatIsAnAdapterHeadings),
  memory: page(memory, memoryHeadings),
  indexeddb: page(indexeddb, indexeddbHeadings),
  sqlite: page(sqlite, sqliteHeadings),
  dynamodb: page(dynamodb, dynamodbHeadings),
  deploying: page(deploying, deployingHeadings),
  'how-sync-works': page(howSyncWorks, howSyncWorksHeadings),
  'std-sync': page(stdSync, stdSyncHeadings),
  strategies: page(strategies, strategiesHeadings),
  'across-tabs': page(acrossTabs, acrossTabsHeadings),
  'paced-updates': page(pacedUpdates, pacedUpdatesHeadings),
  replica: page(replica, replicaHeadings),
};
