import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  ArrowDownIcon,
  LoaderCircleIcon,
  SquarePenIcon,
} from '@kstackz/ui-toolkit/lucide';
import { GestureZone, usePullToRefresh } from '@kstackz/use-gesture';
import { useGesture } from '@kstackz/use-gesture/core';
import { AnimatePresence, motion, useTransform } from 'motion/react';
import { useState } from 'react';
import { Avatar } from './avatar.tsx';
import { type Chat, ME } from './data.ts';
import { Row } from './row.tsx';

/** What the list asks of the app. */
export interface ListActions {
  readonly onMenu: () => void;
  readonly onSelect: (id: string) => void;
  readonly onRefresh: () => Promise<unknown>;
  readonly onPin: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onToggleUnread: (id: string) => void;
}

/**
 * Every chat under a header. The header, and a strip along the left edge,
 * are the app's zone, where a Swipe right opens the sidebar; the list is its
 * own trapped zone, where a Swipe right on a row is that row's, and a pull
 * from its top refreshes.
 */
export function List(
  props: ListActions & { readonly chats: ReadonlyArray<Chat> },
) {
  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        <div className="flex h-14 w-full items-center gap-2">
          <button
            type="button"
            aria-label="Profile and settings"
            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={props.onMenu}
          >
            <Avatar chat={ME} size={34} />
          </button>
          <h1 className="flex-1 text-center text-[17px] font-semibold tracking-tight">
            Chats
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-full"
            aria-label="New chat"
          >
            <SquarePenIcon aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <GestureZone trapped className="absolute inset-0">
          <Chats {...props} />
        </GestureZone>
        {/* The app's, not the list's: a Swipe right from here opens the sidebar. */}
        <div className="absolute inset-y-0 left-0 z-10 w-4" />
      </div>
    </div>
  );
}

/** The scrolling list, with its pull to refresh and one open row at most. */
function Chats(props: ListActions & { readonly chats: ReadonlyArray<Chat> }) {
  const [openRow, setOpenRow] = useState<string | undefined>(undefined);
  const pull = usePullToRefresh({ onRefresh: props.onRefresh, distance: 64 });
  const arrow = useTransform(pull.progress, [0, 1], [0, 180]);
  const indicator = useTransform(pull.progress, [0, 0.4, 1], [0, 0, 1]);

  // A touch anywhere but on the open row shuts it.
  useGesture({
    onStart: (pointers) => {
      const [finger] = pointers.values();
      if (openRow === undefined || finger === undefined) return;
      if (finger.target?.closest(`[data-chat="${openRow}"]`) == null) {
        setOpenRow(undefined);
      }
    },
  });

  return (
    <div
      className="absolute inset-0 overflow-y-auto overscroll-contain"
      onScroll={() => openRow !== undefined && setOpenRow(undefined)}
    >
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-5 text-muted-foreground"
        style={{ opacity: indicator }}
      >
        {pull.state === 'refreshing' ? (
          <LoaderCircleIcon
            className="size-5 animate-spin"
            aria-label="Refreshing"
          />
        ) : (
          <motion.span style={{ rotate: arrow }}>
            <ArrowDownIcon className="size-5" aria-hidden="true" />
          </motion.span>
        )}
      </motion.div>
      <motion.ul
        className="relative bg-background pr-[env(safe-area-inset-right)] pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.5rem)] pl-[env(safe-area-inset-left)]"
        style={{ y: pull.y }}
      >
        <AnimatePresence initial={false}>
          {props.chats.map((chat) => (
            <motion.li
              key={chat.id}
              layout="position"
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', visualDuration: 0.25, bounce: 0 }}
              className="overflow-hidden"
            >
              <Row
                chat={chat}
                open={openRow === chat.id}
                onOpenChange={(open) => setOpenRow(open ? chat.id : undefined)}
                onSelect={() => props.onSelect(chat.id)}
                onPin={() => {
                  setOpenRow(undefined);
                  props.onPin(chat.id);
                }}
                onDelete={() => {
                  setOpenRow(undefined);
                  props.onDelete(chat.id);
                }}
                onToggleUnread={() => props.onToggleUnread(chat.id)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
