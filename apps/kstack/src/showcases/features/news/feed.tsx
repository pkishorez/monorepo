import { Spinner } from '@kstackz/ui-toolkit/components/ui/spinner';
import { ArrowDownIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone, usePullToRefresh } from '@kstackz/use-gesture';
import { type MotionValue, motion, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { ArticleRow } from './article-row.tsx';
import type { Article } from './data.ts';

/**
 * One tab's page: its articles, newest first, scrolling on their own and
 * pulling to refresh from the top. A zone of its own, so each tab pulls alone.
 */
export function Feed(props: {
  readonly articles: ReadonlyArray<Article>;
  readonly width: number;
  readonly row: {
    readonly id: string | undefined;
    readonly x: MotionValue<number>;
  };
  readonly isSaved: (id: string) => boolean;
  readonly images: boolean;
  readonly large: boolean;
  readonly onOpen: (id: string) => void;
  readonly onRefresh: () => Promise<unknown>;
}) {
  return (
    <GestureZone
      className="relative h-full shrink-0"
      style={{ width: props.width }}
    >
      <Articles {...props} />
    </GestureZone>
  );
}

function Articles(props: Parameters<typeof Feed>[0]) {
  const pull = usePullToRefresh({ onRefresh: props.onRefresh });
  // Articles new since the feed first showed slide in.
  const seen = useRef<ReadonlySet<string>>(undefined);
  useEffect(() => {
    seen.current = new Set(props.articles.map((a) => a.id));
  });

  return (
    <>
      <PullIndicator
        y={pull.y}
        armed={pull.state === 'armed'}
        refreshing={pull.state === 'refreshing'}
      />
      <div className="absolute inset-0 overflow-x-hidden overflow-y-auto">
        <motion.ul
          className="flex flex-col divide-y divide-border pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
          style={{ y: pull.y }}
        >
          {props.articles.map((article) => (
            <ArticleRow
              key={article.id}
              article={article}
              x={props.row.id === article.id ? props.row.x : undefined}
              saved={props.isSaved(article.id)}
              fresh={
                seen.current !== undefined && !seen.current.has(article.id)
              }
              images={props.images}
              large={props.large}
              onOpen={() => props.onOpen(article.id)}
            />
          ))}
        </motion.ul>
      </div>
    </>
  );
}

function PullIndicator(props: {
  readonly y: MotionValue<number>;
  readonly armed: boolean;
  readonly refreshing: boolean;
}) {
  const opacity = useTransform(props.y, [8, 48], [0, 1]);
  const top = useTransform(props.y, (y) => y / 2 - 10);
  return (
    <motion.div
      aria-hidden={!props.refreshing}
      className="absolute inset-x-0 top-0 flex justify-center text-muted-foreground"
      style={{ opacity, y: top }}
    >
      {props.refreshing ? (
        <Spinner className="size-5" />
      ) : (
        <ArrowDownIcon
          className="size-5 transition-transform duration-150"
          style={{ rotate: props.armed ? '180deg' : '0deg' }}
        />
      )}
    </motion.div>
  );
}
