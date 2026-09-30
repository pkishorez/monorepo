import { GestureZone, useSidebar } from '@kstackz/use-gesture';
import { motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { appTheme } from '../../../common/theme.ts';
import { ArticleView, useReading } from './article.tsx';
import { TABS } from './data.ts';
import { useFeeds } from './feeds.ts';
import { usePager } from './pager.ts';
import { Reader } from './reader.tsx';
import { Saved, SAVED_WIDTH } from './saved.tsx';
import { Sections, SECTIONS_WIDTH, type Settings } from './sections.tsx';

// Px from a side of the screen that always opens its sidebar.
const EDGE = 24;

/**
 * A news reader on a phone: tabs that swipe sideways, articles that slide
 * left to save, sections on the left and saved articles on the right. The
 * left sidebar opens from a swipe right anywhere on the first tab, since
 * there is no tab before it; elsewhere only from the left edge.
 */
export function NewsApp() {
  return (
    <GestureZone className="fixed inset-0 overflow-hidden bg-background">
      <appTheme.StatusBar />
      <Screen />
    </GestureZone>
  );
}

function Screen() {
  const feeds = useFeeds();
  const pager = usePager(TABS.length);
  const reading = useReading();
  const [panel, setPanel] = useState<'sections' | 'saved'>();
  const [settings, setSettings] = useState<Settings>({
    images: true,
    large: false,
  });
  const article = reading.id === undefined ? undefined : feeds.find(reading.id);

  const sections = useSidebar({
    side: 'left',
    width: SECTIONS_WIDTH,
    open: panel === 'sections',
    onOpenChange: (open) => setPanel(open ? 'sections' : undefined),
    edge: pager.page === 0 ? undefined : EDGE,
    enabled: panel !== 'saved' && article === undefined,
  });
  const saved = useSidebar({
    side: 'right',
    width: SAVED_WIDTH,
    open: panel === 'saved',
    onOpenChange: (open) => setPanel(open ? 'saved' : undefined),
    edge: EDGE,
    enabled: panel !== 'sections' && article === undefined,
  });

  // The feeds sit a little to the left under an open article, and follow it back.
  const shift = useTransform(() => {
    const x = reading.x.get();
    return article === undefined ? 0 : Math.min(0, (x - pager.width) * 0.25);
  });
  const dim = useTransform(() => {
    const x = reading.x.get();
    return pager.width === 0 ? 0 : 0.15 * (1 - x / pager.width);
  });

  const open = (id: string) => {
    setPanel(undefined);
    reading.open(id);
  };

  return (
    <>
      <Reader
        feeds={feeds}
        pager={pager}
        settings={settings}
        shift={shift}
        onSections={() => setPanel('sections')}
        onSaved={() => setPanel('saved')}
        onOpen={open}
      />
      {article === undefined ? null : (
        <>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 bg-black"
            style={{ opacity: dim }}
          />
          <ArticleView
            reading={reading}
            article={article}
            saved={feeds.isSaved(article.id)}
            large={settings.large}
            onSave={() => feeds.toggleSave(article.id)}
          />
        </>
      )}
      <Sections
        sidebar={sections}
        page={pager.page}
        onSection={(index) => {
          pager.goTo(index);
          setPanel(undefined);
        }}
        settings={settings}
        onSettings={setSettings}
      />
      <Saved sidebar={saved} articles={feeds.saved} onOpen={open} />
    </>
  );
}
