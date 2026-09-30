import { BookmarkIcon, BookmarkXIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type MotionValue, motion, useTransform } from 'motion/react';
import { type Article, ago } from './data.ts';
import { SAVE_AT } from './gesture.ts';

/** An article's picture: a gradient in its own hue. */
export function Thumbnail(props: {
  readonly hue: number;
  readonly className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('shrink-0 bg-muted', props.className)}
      style={{
        backgroundImage: `linear-gradient(135deg, oklch(0.78 0.11 ${props.hue}), oklch(0.55 0.15 ${props.hue + 40}))`,
      }}
    />
  );
}

/**
 * One article in a feed: where it's from, its title, and how long it takes
 * to read. Slid left, it shows the bookmark it will set or clear.
 */
export function ArticleRow(props: {
  readonly article: Article;
  readonly x: MotionValue<number> | undefined;
  readonly saved: boolean;
  readonly fresh: boolean;
  readonly images: boolean;
  readonly large: boolean;
  readonly onOpen: () => void;
}) {
  const { article } = props;
  return (
    <motion.li
      initial={props.fresh ? { opacity: 0, height: 0 } : false}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ type: 'spring', visualDuration: 0.25, bounce: 0 }}
      data-article={article.id}
      className="relative overflow-hidden"
    >
      {props.x === undefined ? null : <Hint x={props.x} saved={props.saved} />}
      <motion.div
        className="relative flex cursor-pointer gap-3 bg-background py-3.5 pr-4 pl-6"
        style={{ x: props.x }}
        onClick={props.onOpen}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            {article.source} · {ago(article.age)}
          </p>
          <h3
            className={cn(
              'leading-snug font-semibold text-balance',
              props.large ? 'text-lg' : 'text-[15px]',
            )}
          >
            <button
              type="button"
              className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {article.title}
            </button>
          </h3>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {article.minutes} min
            {props.saved ? (
              <BookmarkIcon
                aria-label="Saved"
                className="size-3.5 fill-current text-foreground"
              />
            ) : null}
          </p>
        </div>
        {props.images ? (
          <Thumbnail hue={article.hue} className="size-18 rounded-md" />
        ) : null}
      </motion.div>
    </motion.li>
  );
}

function Hint(props: {
  readonly x: MotionValue<number>;
  readonly saved: boolean;
}) {
  const scale = useTransform(props.x, [-SAVE_AT, -SAVE_AT / 2], [1, 0.5]);
  const opacity = useTransform(props.x, [-SAVE_AT, -SAVE_AT / 2], [1, 0]);
  const Icon = props.saved ? BookmarkXIcon : BookmarkIcon;
  return (
    <div className="absolute inset-0 flex items-center justify-end bg-primary pr-7 text-primary-foreground">
      <motion.span style={{ scale, opacity }}>
        <Icon aria-hidden="true" className="size-5" />
      </motion.span>
    </div>
  );
}
