import { useState } from 'react';
import { type Article, ARTICLES, INCOMING } from './data.ts';

/** Every tab's feed, what a refresh brings, and what is saved, newest first. */
export function useFeeds() {
  const [articles, setArticles] = useState(ARTICLES);
  const [found, setFound] = useState<Readonly<Record<string, number>>>({});
  const [saved, setSaved] = useState<ReadonlyArray<string>>([]);

  const find = (id: string) => articles.find((a) => a.id === id);

  return {
    feed: (tab: string) => articles.filter((a) => a.tab === tab),
    find,
    saved: saved.flatMap((id) => find(id) ?? []),
    isSaved: (id: string) => saved.includes(id),
    toggleSave: (id: string) =>
      setSaved((all) =>
        all.includes(id) ? all.filter((s) => s !== id) : [id, ...all],
      ),
    /** The next article waiting in `tab`, on top; nothing once they are all in. */
    refresh: (tab: string) => {
      const index = found[tab] ?? 0;
      const fresh: Article | undefined = INCOMING[tab]?.[index];
      if (fresh === undefined) return;
      setFound((all) => ({ ...all, [tab]: index + 1 }));
      setArticles((all) => [fresh, ...all]);
    },
  };
}

export type Feeds = ReturnType<typeof useFeeds>;
