import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  ArchiveIcon,
  ChevronLeftIcon,
  InboxIcon,
  PaperclipIcon,
  StarIcon,
  Trash2Icon,
} from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { GestureZone } from '@kstackz/use-gesture';
import { type SwipeRelease, useSwipe } from '@kstackz/use-gesture/recognizers';
import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  motion,
  useTransform,
} from 'motion/react';
import { useEffect, useRef } from 'react';
import { Avatar } from './avatar.tsx';
import type { Mail } from './data.ts';
import { EDGE } from './row-swipe.ts';

const SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0 } as const;

/**
 * One mail over the list, sliding in from the right. `progress` is how far
 * in it is, 0 to 1, for the list to follow. It is its own trapped zone: a
 * Swipe right from the left edge takes it back under the finger, and no
 * touch in it reaches the list or the sidebars.
 */
export function Message(props: {
  readonly mail: Mail;
  readonly progress: MotionValue<number>;
  readonly back: string;
  readonly onClosed: () => void;
  readonly onStar: () => void;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
}) {
  const x = useTransform(props.progress, (p) => `${(1 - p) * 100}%`);
  return (
    <motion.div
      className="absolute inset-0 z-30 shadow-[-12px_0_32px_rgb(0_0_0/0.12)]"
      style={{ x }}
    >
      <GestureZone trapped className="flex h-full flex-col bg-background">
        <Reader {...props} />
      </GestureZone>
    </motion.div>
  );
}

function Reader(props: Parameters<typeof Message>[0]) {
  const { mail, progress } = props;
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<AnimationPlaybackControls | undefined>(undefined);
  const width = useRef(1);
  const tracking = useRef(false);

  const to = (target: 0 | 1, velocity = 0) => {
    animation.current?.stop();
    animation.current = animate(progress, target, { ...SPRING, velocity });
    return animation.current;
  };
  const leave = (velocity = 0, then?: () => void) =>
    void to(0, velocity).finished.then(() => {
      props.onClosed();
      then?.();
    });

  // It slides in once, as it opens.
  useEffect(() => {
    to(1);
    return () => animation.current?.stop();
  }, []);

  const release = (at?: SwipeRelease) => {
    if (!tracking.current) return;
    tracking.current = false;
    const velocity = -(at?.velocity ?? 0) / width.current;
    if (at !== undefined && at.projected > width.current / 2) leave(velocity);
    else to(1, velocity);
  };
  const back = useSwipe({
    direction: 'right',
    from: { edge: 'left', within: EDGE },
    onStart: () => {
      animation.current?.stop();
      width.current = ref.current?.offsetWidth ?? 1;
      tracking.current = true;
    },
    onCommit: release,
    onCancel: (_reason, at) => release(at),
  });
  useEffect(() =>
    back.offset.on('change', (offset) => {
      if (tracking.current) progress.set(1 - offset / width.current);
    }),
  );

  const archived = mail.folder === 'archive';
  return (
    <div ref={ref} className="flex h-full flex-col">
      <header className="box-content flex h-14 shrink-0 items-center gap-1 pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
        <Button
          variant="ghost"
          className="h-11 gap-0.5 px-2 text-[15px] md:h-9"
          onClick={() => leave()}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-5" />
          {props.back}
        </Button>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          aria-label={mail.starred ? 'Unstar' : 'Star'}
          aria-pressed={mail.starred}
          className="size-11 md:size-9"
          onClick={props.onStar}
        >
          <StarIcon
            aria-hidden="true"
            className={cn(mail.starred && 'fill-amber-400 text-amber-400')}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={archived ? 'Move to Inbox' : 'Archive'}
          className="size-11 md:size-9"
          onClick={() => leave(0, props.onArchive)}
        >
          {archived ? (
            <InboxIcon aria-hidden="true" />
          ) : (
            <ArchiveIcon aria-hidden="true" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete"
          className="size-11 md:size-9"
          onClick={() => leave(0, props.onDelete)}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </header>
      <article className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pr-[max(1.25rem,env(safe-area-inset-right))] pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+5rem)] pl-[max(1.25rem,env(safe-area-inset-left))]">
        <h2 className="text-xl leading-snug font-semibold tracking-tight text-balance">
          {mail.subject}
        </h2>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={mail.from} />
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate font-medium">{mail.from}</span>
            <span className="truncate text-sm text-muted-foreground">
              {mail.email}
            </span>
          </div>
          <span className="shrink-0 self-start text-xs text-muted-foreground tabular-nums">
            {mail.time}
          </span>
        </div>
        <div className="mt-6 flex max-w-prose flex-col gap-4 text-[15px] leading-relaxed">
          {mail.body.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {mail.attachment === undefined ? null : (
          <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm ring-1 ring-edge">
            <PaperclipIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            {mail.attachment}
          </div>
        )}
      </article>
    </div>
  );
}
