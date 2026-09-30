import { Toaster } from '@kstackz/ui-toolkit/components/ui/sonner';
import { GestureZone, useSidebar } from '@kstackz/use-gesture';
import { useGesture } from '@kstackz/use-gesture/core';
import { motion, useMotionValue, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import { appTheme } from '../../../common/theme.ts';
import { Compose } from './compose.tsx';
import { FOLDERS, type FolderId, inFolder } from './data.ts';
import { type Filter, Filters, NO_FILTER } from './filters.tsx';
import { Folders } from './folders.tsx';
import { Inbox } from './inbox.tsx';
import { type Mailbox, useMailbox } from './mailbox.ts';
import { Message } from './message.tsx';
import { EDGE, useRowSwipe } from './row-swipe.ts';

const SIDEBAR_WIDTH = 288;

// The status bar takes the page's color while both sidebars are shut and
// the sidebar's while one is open, as plain sRGB per theme.
const STATUS_BAR = {
  shut: 'light-dark(#ffffff, #0a0a0a)', // --background
  open: 'light-dark(#fafafa, #151515)', // --sidebar
};

// Undo toasts sit just above the floating pill.
const TOAST_OFFSET = {
  bottom: 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 4.5rem)',
};

/**
 * A mail app on one screen: folders on the left, filters on the right, the
 * list between them, and a mail over the list once opened. The whole screen
 * is one zone; the list, an open row and an open mail each have their own.
 */
export function MailApp() {
  const { theme } = appTheme.useTheme();
  const box = useMailbox();
  const [composing, setComposing] = useState(false);
  return (
    <>
      <GestureZone className="fixed inset-0 overflow-hidden bg-sidebar">
        <Screen box={box} onCompose={() => setComposing(true)} />
      </GestureZone>
      <Compose open={composing} onOpenChange={setComposing} onSend={box.send} />
      <Toaster
        theme={theme}
        position="bottom-center"
        offset={TOAST_OFFSET}
        mobileOffset={TOAST_OFFSET}
      />
    </>
  );
}

/**
 * Everything the root zone hears. The folders open from a Swipe right
 * anywhere the list's rows do not take it, and always from the left edge;
 * the filters only from the right edge. A touch anywhere but on the open
 * row shuts it, and while a row is open no sidebar opens.
 */
function Screen(props: {
  readonly box: Mailbox;
  readonly onCompose: () => void;
}) {
  const { box } = props;
  const [folderId, setFolderId] = useState<FolderId>('inbox');
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [side, setSide] = useState<'folders' | 'filters'>();
  const [reading, setReading] = useState<string>();
  // How far the open mail is in, 0 to 1.
  const reveal = useMotionValue(0);

  const swipe = useRowSwipe({
    onToggleRead: box.toggleRead,
    onAway: box.archive,
  });
  const folders = useSidebar({
    side: 'left',
    width: SIDEBAR_WIDTH,
    open: side === 'folders',
    onOpenChange: (open) => setSide(open ? 'folders' : undefined),
    enabled: side !== 'filters' && !swipe.open,
  });
  const filters = useSidebar({
    side: 'right',
    width: SIDEBAR_WIDTH,
    edge: EDGE,
    open: side === 'filters',
    onOpenChange: (open) => setSide(open ? 'filters' : undefined),
    enabled: side !== 'folders' && !swipe.open,
  });
  // The left edge is the folders', even over a row, whose Swipe right
  // would otherwise take it.
  useGesture({
    enabled: side === undefined && !swipe.open,
    captures: (point) => point.x <= EDGE,
  });

  const shutRow = useRef(false);
  useGesture({
    onStart: (pointers) => {
      const [first] = pointers.values();
      if (first === undefined) return;
      const landed = first.target?.closest<HTMLElement>('[data-row]');
      shutRow.current = swipe.open && landed?.dataset.row !== swipe.id;
      if (shutRow.current) swipe.close();
    },
    onEnd: (_pointers, end) => {
      // A touch that shut the open row does nothing else.
      if (shutRow.current) end.preventClick();
    },
  });

  const lift = useTransform(
    [folders.progress, filters.progress],
    ([l = 0, r = 0]: Array<number>) => Math.max(l, r),
  );
  const pageX = useTransform(
    [folders.progress, filters.progress],
    ([l = 0, r = 0]: Array<number>) => (l - r) * SIDEBAR_WIDTH,
  );
  const scale = useTransform(lift, [0, 1], [1, 0.92]);
  const radius = useTransform(lift, [0, 1], [0, 32]);
  const origin = useTransform(filters.progress, (r) =>
    r > 0 ? '100% 50%' : '0% 50%',
  );
  const foldersX = useTransform(folders.progress, [0, 1], ['-20%', '0%']);
  const filtersX = useTransform(filters.progress, [0, 1], ['20%', '0%']);
  const behind = useTransform(reveal, [0, 1], ['0%', '-25%']);

  const folder = FOLDERS.find((f) => f.id === folderId) ?? FOLDERS[0];
  const inHere = box.mails.filter((m) => inFolder(m, folderId));
  const mails = inHere.filter(
    (m) =>
      (!filter.unread || m.unread) &&
      (!filter.attachments || m.attachment !== undefined),
  );
  const mail = reading === undefined ? undefined : box.find(reading);
  if (folder === undefined) return null;

  return (
    <>
      <appTheme.StatusBar
        color={side === undefined ? STATUS_BAR.shut : STATUS_BAR.open}
      />
      <motion.aside
        aria-label="Folders"
        inert={side !== 'folders'}
        className="absolute inset-y-0 left-0 bg-sidebar text-sidebar-foreground"
        style={{ width: SIDEBAR_WIDTH, x: foldersX, opacity: folders.progress }}
      >
        <Folders
          mails={box.mails}
          current={folderId}
          onPick={(id) => {
            setFolderId(id);
            setSide(undefined);
          }}
        />
      </motion.aside>
      <motion.aside
        aria-label="Filters"
        inert={side !== 'filters'}
        className="absolute inset-y-0 right-0 bg-sidebar text-sidebar-foreground"
        style={{ width: SIDEBAR_WIDTH, x: filtersX, opacity: filters.progress }}
      >
        <Filters filter={filter} onChange={setFilter} />
      </motion.aside>
      <motion.div
        className="absolute inset-0 z-10 overflow-hidden bg-background shadow-xl"
        style={{
          x: pageX,
          scale,
          borderRadius: radius,
          transformOrigin: origin,
        }}
      >
        <motion.div
          inert={mail !== undefined}
          className="absolute inset-0"
          style={{ x: behind }}
        >
          <Inbox
            folder={folder}
            view={`${folderId}:${filter.unread}:${filter.attachments}`}
            mails={mails}
            unread={inHere.filter((m) => m.unread).length}
            filtered={filter.unread || filter.attachments}
            box={box}
            swipe={swipe}
            onFolders={() => setSide('folders')}
            onFilters={() => setSide('filters')}
            onOpen={(id) => {
              box.setRead(id, true);
              reveal.jump(0);
              setReading(id);
            }}
            onCompose={props.onCompose}
          />
        </motion.div>
        {mail === undefined ? null : (
          <>
            <motion.div
              className="pointer-events-none absolute inset-0 z-20 bg-black/10 dark:bg-black/40"
              style={{ opacity: reveal }}
            />
            <Message
              key={mail.id}
              mail={mail}
              progress={reveal}
              back={folder.title}
              onClosed={() => setReading(undefined)}
              onStar={() => box.toggleStar(mail.id)}
              onArchive={() => box.archive(mail.id)}
              onDelete={() => box.remove(mail.id)}
            />
          </>
        )}
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 z-30 bg-black/30 dark:bg-black/50"
          style={{
            opacity: lift,
            pointerEvents: side === undefined ? 'none' : 'auto',
          }}
          onClick={() => setSide(undefined)}
        />
      </motion.div>
    </>
  );
}
