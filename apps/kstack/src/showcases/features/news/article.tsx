import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { BookmarkIcon, ChevronLeftIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { GestureZone } from '@kstackz/use-gesture';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  type AnimationPlaybackControls,
  animate,
  motion,
  useMotionValue,
} from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { type Article as ArticleData, ago, BODY } from './data.ts';
import { Thumbnail } from './article-row.tsx';

const OPEN = { type: 'spring', visualDuration: 0.3, bounce: 0 } as const;
const CLOSE = { type: 'spring', visualDuration: 0.22, bounce: 0 } as const;

/**
 * The article on top, if any, and how far it has slid off to the right:
 * 0 open, the screen's width gone.
 */
export function useReading() {
  const [id, setId] = useState<string>();
  const x = useMotionValue(0);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  const to = (
    value: number,
    spring: typeof OPEN | typeof CLOSE,
    velocity = 0,
    done?: () => void,
  ) => {
    animation.current?.stop();
    animation.current = animate(x, value, {
      ...spring,
      velocity,
      onComplete: done,
    });
  };
  return {
    id,
    x,
    open: (next: string) => {
      setId(next);
      x.jump(innerWidth);
      to(0, OPEN);
    },
    close: (velocity = 0) =>
      to(innerWidth, CLOSE, velocity, () => setId(undefined)),
    /** Back where it was, after a swipe that fell short. */
    stay: (velocity = 0) => to(0, OPEN, velocity),
    grab: () => animation.current?.stop(),
  };
}

export type Reading = ReturnType<typeof useReading>;

/**
 * An article over the feeds, in its own zone; the sidebars are off while it
 * is open. A swipe right from the left edge takes it back, following the
 * finger; the feeds slide in behind it.
 */
export function ArticleView(props: {
  readonly reading: Reading;
  readonly article: ArticleData;
  readonly saved: boolean;
  readonly large: boolean;
  readonly onSave: () => void;
}) {
  return (
    <GestureZone className="absolute inset-0 z-10">
      <Page {...props} />
    </GestureZone>
  );
}

function Page(props: Parameters<typeof ArticleView>[0]) {
  const { reading, article } = props;
  const following = useRef(false);
  const settle = (release?: { projected: number; velocity: number }) => {
    following.current = false;
    if (release !== undefined && release.projected > innerWidth / 2) {
      reading.close(release.velocity);
    } else reading.stay(release?.velocity);
  };
  const back = useSwipe({
    direction: 'right',
    from: { edge: 'left', within: 24 },
    onStart: () => {
      reading.grab();
      following.current = true;
    },
    onCommit: settle,
    onCancel: (_reason, release) => settle(release),
  });
  useEffect(
    () =>
      back.offset.on('change', (offset) => {
        if (following.current) reading.x.set(offset);
      }),
    [back.offset, reading.x],
  );

  return (
    <motion.div
      className="absolute inset-0 flex flex-col bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] shadow-2xl"
      style={{ x: reading.x }}
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-2 mt-[env(safe-area-inset-top)]">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          className="size-11 md:size-9"
          onClick={() => reading.close()}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={props.saved ? 'Remove from saved' : 'Save'}
          aria-pressed={props.saved}
          className="size-11 md:size-9"
          onClick={props.onSave}
        >
          <BookmarkIcon
            aria-hidden="true"
            className={cn(props.saved && 'fill-current')}
          />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto flex max-w-2xl flex-col gap-4 px-6 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
          <Thumbnail
            hue={article.hue}
            className="-mx-6 aspect-[16/9] sm:mx-0 sm:rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            {article.source} · {ago(article.age)} · {article.minutes} min
          </p>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">
            {article.title}
          </h1>
          <p
            className={cn(
              'text-muted-foreground',
              props.large ? 'text-xl' : 'text-lg',
            )}
          >
            {article.summary}
          </p>
          {BODY.map((paragraph) => (
            <p
              key={paragraph}
              className={cn(
                'leading-relaxed',
                props.large ? 'text-lg' : 'text-base',
              )}
            >
              {paragraph}
            </p>
          ))}
        </article>
      </div>
    </motion.div>
  );
}
