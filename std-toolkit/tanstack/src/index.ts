import { createCollection } from "@tanstack/react-db";
import type { CollectionConfig, LoadSubsetOptions } from "@tanstack/react-db";

interface DummyItem {
  id: number;
  name: string;
  category: string;
  priority: number;
  createdAt: Date;
}

function generateDummyItems(count: number): DummyItem[] {
  const categories = ["work", "personal", "urgent", "archive"];
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
    category: categories[i % categories.length]!,
    priority: (i % 5) + 1,
    createdAt: new Date(Date.now() - i * 86400000),
  }));
}

async function fakeFetch(opts: LoadSubsetOptions): Promise<DummyItem[]> {
  const { limit, where, offset, orderBy } = opts;
  console.log(
    "OPTIONS: ",
    JSON.stringify({ limit, where, offset, orderBy }, null, 2),
  );
  return generateDummyItems(100);
}

const dummyCollectionConfig: CollectionConfig<DummyItem, number> = {
  id: "dummy-items",
  getKey: (item) => item.id,
  syncMode: "on-demand",

  utils: {},

  sync: {
    sync: (params) => {
      const { begin, write, collection, commit, markReady } = params;
      const loadedSubsets = new Map<string, Set<number>>();

      const loadSubset = async (opts: LoadSubsetOptions): Promise<void> => {
        const cacheKey = JSON.stringify({
          where: opts.where,
          orderBy: opts.orderBy,
          limit: opts.limit,
        });

        if (loadedSubsets.has(cacheKey)) return;

        const items = await fakeFetch(opts);
        const loadedKeys = new Set<number>();

        begin();
        for (const item of items) {
          if (collection.has(item.id)) continue;
          write({ type: "insert", value: item });
          loadedKeys.add(item.id);
        }
        commit();

        loadedSubsets.set(cacheKey, loadedKeys);
        markReady();
      };

      const unloadSubset = (opts: LoadSubsetOptions): void => {
        const cacheKey = JSON.stringify({
          where: opts.where,
          orderBy: opts.orderBy,
          limit: opts.limit,
        });
        loadedSubsets.delete(cacheKey);
      };

      const cleanup = (): void => {
        loadedSubsets.clear();
      };

      return { loadSubset, unloadSubset, cleanup };
    },
  },
};

export const dummyCollection = createCollection(dummyCollectionConfig);
export type { CollectionConfig, LoadSubsetOptions };
