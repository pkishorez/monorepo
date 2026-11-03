import type { StdToolkitSlug as Slug } from '../../../shared/index.ts';
import { page } from '../page.ts';
import type { Page } from '../page.ts';
import * as introduction from './get-started/introduction/introduction.mdx';
import * as quickStart from './get-started/quick-start/quick-start.mdx';
import * as entityEschema from './evolving-schema/entity-eschema/entity-eschema.mdx';
import * as valueEschema from './evolving-schema/value-eschema/value-eschema.mdx';
import * as shapesInsideShapes from './evolving-schema/shapes-inside-shapes/shapes-inside-shapes.mdx';
import * as addingAVersion from './evolving-schema/adding-a-version/adding-a-version.mdx';
import * as renameAndRemove from './evolving-schema/rename-and-remove/rename-and-remove.mdx';
import * as adoptingExistingData from './evolving-schema/adopting-existing-data/adopting-existing-data.mdx';
import * as upgradeCheck from './evolving-schema/upgrade-check/upgrade-check.mdx';
import * as gotchas from './evolving-schema/gotchas/gotchas.mdx';
import * as keyedEntity from './entities/keyed-entity/keyed-entity.mdx';
import * as singleEntity from './entities/single-entity/single-entity.mdx';
import * as subscribing from './entities/subscribing/subscribing.mdx';
import * as singleTableDesign from './std-table/single-table-design/single-table-design.mdx';
import * as indexes from './std-table/indexes/indexes.mdx';
import * as driftAndReindex from './std-table/drift-and-reindex/drift-and-reindex.mdx';
import * as tableMode from './std-table/table-mode/table-mode.mdx';
import * as snapshot from './std-table/snapshot/snapshot.mdx';
import * as transactions from './std-table/transactions/transactions.mdx';
import * as memory from './adapters/memory/memory.mdx';
import * as indexeddb from './adapters/indexeddb/indexeddb.mdx';
import * as sqlite from './adapters/sqlite/sqlite.mdx';
import * as dynamodb from './adapters/dynamodb/dynamodb.mdx';
import * as deploying from './adapters/deploying/deploying.mdx';
import * as stdSync from './sync/std-sync/std-sync.mdx';
import * as strategies from './sync/strategies/strategies.mdx';
import * as acrossTabs from './sync/across-tabs/across-tabs.mdx';
import * as pacedUpdates from './sync/paced-updates/paced-updates.mdx';
import * as replica from './sync/replica/replica.mdx';

/*
 * Every written std-toolkit docs page, by slug. A slug in the table of
 * contents with no page here does not compile.
 */

export const STD_TOOLKIT: Record<Slug, Page> = {
  introduction: page(introduction),
  'quick-start': page(quickStart),
  'entity-eschema': page(entityEschema),
  'value-eschema': page(valueEschema),
  'shapes-inside-shapes': page(shapesInsideShapes),
  'adding-a-version': page(addingAVersion),
  'rename-and-remove': page(renameAndRemove),
  'adopting-existing-data': page(adoptingExistingData),
  'upgrade-check': page(upgradeCheck),
  gotchas: page(gotchas),
  'keyed-entity': page(keyedEntity),
  'single-entity': page(singleEntity),
  subscribing: page(subscribing),
  'single-table-design': page(singleTableDesign),
  indexes: page(indexes),
  'drift-and-reindex': page(driftAndReindex),
  'table-mode': page(tableMode),
  snapshot: page(snapshot),
  transactions: page(transactions),
  memory: page(memory),
  indexeddb: page(indexeddb),
  sqlite: page(sqlite),
  dynamodb: page(dynamodb),
  deploying: page(deploying),
  'std-sync': page(stdSync),
  strategies: page(strategies),
  'across-tabs': page(acrossTabs),
  'paced-updates': page(pacedUpdates),
  replica: page(replica),
};
