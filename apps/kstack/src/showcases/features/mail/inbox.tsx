import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Spinner } from '@kstackz/ui-toolkit/components/ui/spinner';
import {
  ArrowDownIcon,
  InboxIcon,
  ListFilterIcon,
  MenuIcon,
  SquarePenIcon,
} from '@kstackz/ui-toolkit/lucide';
import { GestureZone, usePullToRefresh } from '@kstackz/use-gesture';
import { AnimatePresence, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import type { Folder, Mail } from './data.ts';
import type { Mailbox } from './mailbox.ts';
import { Row } from './row.tsx';
import { type RowSwipe, rowAt, useRowDrag } from './row-swipe.ts';

/** How far the refresh indicator travels to arm, in px. */
const PULL = 64;

/**
 * A folder's page: its header, its mail in a list of its own zone that
 * pulls to refresh and swipes rows, and the compose button.
 */
export function Inbox(props: {
  readonly folder: Folder;
  /** Changes with the folder and filters: the list starts over, at its top. */
  readonly view: string;
  readonly mails: ReadonlyArray<Mail>;
  readonly unread: number;
  readonly filtered: boolean;
  readonly box: Mailbox;
  readonly swipe: RowSwipe;
  readonly onFolders: () => void;
  readonly onFilters: () => void;
  readonly onOpen: (id: string) => void;
  readonly onCompose: () => void;
}) {
  const { folder, swipe } = props;
  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <header className="box-content flex h-14 shrink-0 items-center gap-1 border-b border-border pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Folders"
          className="size-11 md:size-9"
          onClick={props.onFolders}
        >
          <MenuIcon aria-hidden="true" />
        </Button>
        <h1 className="flex min-w-0 flex-1 items-baseline gap-2 text-[17px] font-semibold tracking-tight">
          <span className="truncate">{folder.title}</span>
          {props.unread > 0 ? (
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              {props.unread}
            </span>
          ) : null}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Filters"
          aria-pressed={props.filtered}
          className="relative size-11 md:size-9"
          onClick={props.onFilters}
        >
          <ListFilterIcon aria-hidden="true" />
          {props.filtered ? (
            <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-sky-500 ring-2 ring-background md:top-1.5 md:right-1.5" />
          ) : null}
        </Button>
      </header>
      <List
        key={props.view}
        mails={props.mails}
        box={props.box}
        swipe={swipe}
        onOpen={props.onOpen}
      />
      <Button
        aria-label="Compose"
        className="absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.25rem)] z-10 size-14 rounded-2xl shadow-lg"
        onClick={props.onCompose}
      >
        <SquarePenIcon aria-hidden="true" className="size-5" />
      </Button>
    </div>
  );
}

type ListProps = {
  readonly mails: ReadonlyArray<Mail>;
  readonly box: Mailbox;
  readonly swipe: RowSwipe;
  readonly onOpen: (id: string) => void;
};

/**
 * The list's own zone, which scrolls. Scrolling shuts an open row. It pulls
 * to refresh only from its top, even with a mouse, which never scrolls it.
 */
function List(props: ListProps) {
  const [atTop, setAtTop] = useState(true);
  return (
    <GestureZone
      className="relative min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) => {
        if (props.swipe.open) props.swipe.close();
        setAtTop(event.currentTarget.scrollTop <= 0);
      }}
    >
      <Rows {...props} atTop={atTop} />
    </GestureZone>
  );
}

/** The rows: a Swipe down at the top refreshes, a Swipe sideways on a row moves it. */
function Rows(props: ListProps & { readonly atTop: boolean }) {
  const { box, swipe } = props;
  const pull = usePullToRefresh({
    onRefresh: box.refresh,
    distance: PULL,
    enabled: props.atTop,
  });
  useRowDrag(swipe, { enabled: !swipe.open, pick: rowAt });
  const turn = useTransform(pull.progress, [0, 1], [0, 180]);

  return (
    <>
      <motion.div
        className="absolute inset-x-0 top-0 flex items-center justify-center text-muted-foreground"
        style={{ height: PULL, opacity: pull.progress }}
      >
        {pull.state === 'refreshing' ? (
          <Spinner className="size-5" />
        ) : (
          <motion.span style={{ rotate: turn }}>
            <ArrowDownIcon aria-hidden="true" className="size-5" />
          </motion.span>
        )}
      </motion.div>
      <motion.ul
        className="relative min-h-full bg-background pr-[env(safe-area-inset-right)] pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+9rem)] pl-[env(safe-area-inset-left)]"
        style={{ y: pull.y }}
      >
        <AnimatePresence initial={false}>
          {props.mails.map((mail) => (
            <Row
              key={mail.id}
              mail={mail}
              swipe={swipe}
              onOpen={() => props.onOpen(mail.id)}
              onArchive={box.archive}
              onDelete={box.remove}
            />
          ))}
        </AnimatePresence>
        {props.mails.length === 0 ? (
          <li className="flex flex-col items-center gap-2 pt-32 text-sm text-muted-foreground">
            <InboxIcon aria-hidden="true" className="size-6" />
            No mail
          </li>
        ) : null}
      </motion.ul>
    </>
  );
}
