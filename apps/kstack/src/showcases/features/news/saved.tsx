import type { useSidebar } from '@kstackz/use-gesture';
import { motion } from 'motion/react';
import { type Article, ago } from './data.ts';
import { Thumbnail } from './article-row.tsx';

/** Its width in px. */
export const SAVED_WIDTH = 300;

/** The right sidebar: every saved article, newest first, to open. */
export function Saved(props: {
  readonly sidebar: ReturnType<typeof useSidebar>;
  readonly articles: ReadonlyArray<Article>;
  readonly onOpen: (id: string) => void;
}) {
  const { sidebar } = props;
  return (
    <>
      <motion.div
        className="absolute inset-0 z-20 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        aria-label="Saved"
        className="absolute inset-y-0 right-0 z-20 flex flex-col bg-sidebar pt-[max(0.75rem,env(safe-area-inset-top))] pr-[env(safe-area-inset-right)] shadow-xl"
        style={{ width: SAVED_WIDTH, x: sidebar.x }}
      >
        <p className="flex items-baseline gap-2 px-5 pt-3 pb-2 text-sm font-semibold">
          Saved
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {props.articles.length}
          </span>
        </p>
        {props.articles.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">
            Nothing saved yet
          </p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
            {props.articles.map((article) => (
              <li key={article.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-sidebar-accent/60"
                  onClick={() => props.onOpen(article.id)}
                >
                  <Thumbnail hue={article.hue} className="size-10 rounded" />
                  <span className="flex min-w-0 flex-col">
                    <span className="line-clamp-2 text-sm leading-snug font-medium">
                      {article.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {article.source} · {ago(article.age)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </motion.aside>
    </>
  );
}
