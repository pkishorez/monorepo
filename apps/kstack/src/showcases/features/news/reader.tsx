import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { BookmarkIcon, MenuIcon } from '@kstackz/ui-toolkit/lucide';
import { GestureZone } from '@kstackz/use-gesture';
import { type MotionValue, motion } from 'motion/react';
import { TABS } from './data.ts';
import { Feed } from './feed.tsx';
import type { Feeds } from './feeds.ts';
import { useReaderGesture } from './gesture.ts';
import type { Pager } from './pager.ts';
import type { Settings } from './sections.tsx';
import { TabStrip } from './tab-strip.tsx';

const refreshing = () => new Promise((resolve) => setTimeout(resolve, 900));

type ReaderProps = {
  readonly feeds: Feeds;
  readonly pager: Pager;
  readonly settings: Settings;
  readonly shift: MotionValue<number>;
  readonly onSections: () => void;
  readonly onSaved: () => void;
  readonly onOpen: (id: string) => void;
};

/**
 * The feeds: a header, the tabs, and one page per tab on a track the
 * finger moves. The zone every sideways swipe on them is read from.
 */
export function Reader(props: ReaderProps) {
  return (
    <GestureZone className="absolute inset-0">
      <motion.div
        className="absolute inset-0 flex flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]"
        style={{ x: props.shift }}
      >
        <Content {...props} />
      </motion.div>
    </GestureZone>
  );
}

function Content(props: ReaderProps) {
  const { feeds, pager, settings } = props;
  const gesture = useReaderGesture({ pager, onSave: feeds.toggleSave });
  const count = feeds.saved.length;

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 mt-[env(safe-area-inset-top)]">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sections and settings"
          className="size-11 md:size-9"
          onClick={props.onSections}
        >
          <MenuIcon aria-hidden="true" />
        </Button>
        <h1 className="flex-1 text-[15px] font-semibold tracking-tight">
          News
        </h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Saved, ${count}`}
          className="relative size-11 md:size-9"
          onClick={props.onSaved}
        >
          <BookmarkIcon aria-hidden="true" />
          {count === 0 ? null : (
            <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
              {count}
            </span>
          )}
        </Button>
      </header>
      <TabStrip pager={pager} />
      <div ref={pager.ref} className="relative min-h-0 flex-1 overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 flex"
          style={{
            x: pager.x,
            visibility: pager.width === 0 ? 'hidden' : undefined,
          }}
        >
          {TABS.map((tab) => (
            <Feed
              key={tab.id}
              articles={feeds.feed(tab.id)}
              width={pager.width}
              row={{ id: gesture.row, x: gesture.rowX }}
              isSaved={feeds.isSaved}
              images={settings.images}
              large={settings.large}
              onOpen={props.onOpen}
              onRefresh={() => refreshing().then(() => feeds.refresh(tab.id))}
            />
          ))}
        </motion.div>
      </div>
    </>
  );
}
