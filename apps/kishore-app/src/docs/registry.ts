import type { VTestReport } from '@monorepo/vtest/types';

import cacheReport from '@std-toolkit/cache/vtest-report';
import dbDynamodbReport from '@std-toolkit/db-dynamodb/vtest-report';
import sqliteReport from '@std-toolkit/sqlite/vtest-report';

export type DocsEntry = {
  slug: string;
  title: string;
  collection: string;
  report: VTestReport;
};

export const docsRegistry: DocsEntry[] = [
  {
    slug: 'db-dynamodb',
    title: 'DynamoDB',
    collection: 'std-toolkit',
    report: dbDynamodbReport as VTestReport,
  },
  // {
  //   slug: 'eschema',
  //   title: 'eschema',
  //   collection: 'std-toolkit',
  //   report: eschemaReport as VTestReport,
  // },
  {
    slug: 'sqlite',
    title: 'SQLite',
    collection: 'std-toolkit',
    report: sqliteReport as VTestReport,
  },
  {
    slug: 'cache',
    title: 'Cache',
    collection: 'std-toolkit',
    report: cacheReport as VTestReport,
  },
];

export const findDocsEntry = (slug: string): DocsEntry | undefined =>
  docsRegistry.find((e) => e.slug === slug);

export const docsByCollection = (): {
  collection: string;
  entries: DocsEntry[];
}[] => {
  const map = new Map<string, DocsEntry[]>();
  for (const entry of docsRegistry) {
    const list = map.get(entry.collection) ?? [];
    list.push(entry);
    map.set(entry.collection, list);
  }
  return [...map.entries()]
    .map(([collection, entries]) => ({ collection, entries }))
    .sort((a, b) => a.collection.localeCompare(b.collection));
};
