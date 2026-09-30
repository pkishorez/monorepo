import { GestureZone } from '@kstackz/use-gesture';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import { appTheme } from '../../../common/theme.ts';
import {
  type Chat,
  createChats,
  INCOMING,
  type Message,
  type Quote,
  sortChats,
} from './data.ts';
import { List } from './list.tsx';
import { Sidebar } from './sidebar.tsx';
import { Thread } from './thread.tsx';

// Where the thread rests while none is open: far off, whatever the width.
const AWAY = 100_000;
const OPEN_SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0 } as const;
const CLOSE_SPRING = {
  type: 'spring',
  visualDuration: 0.22,
  bounce: 0,
} as const;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A messenger: the chat list, a sidebar with your profile, and the open
 * thread sliding over the list. The app's zone holds them all; the list and
 * the thread each own a trapped zone inside it.
 */
export function ChatApp() {
  const [chats, setChats] = useState(() => createChats(Date.now()));
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const arrivals = useRef(0);

  // The thread's offset: 0 open, the screen's width shut.
  const threadX = useMotionValue(AWAY);
  const width = () => root.current?.clientWidth ?? innerWidth;
  const behind = (x: number) => Math.max(0, 1 - x / width());
  // The list drifts left and dims as the thread covers it.
  const listX = useTransform(threadX, (x) => -behind(x) * width() * 0.25);
  const dim = useTransform(threadX, behind);

  const update = (id: string, change: (chat: Chat) => Chat) =>
    setChats((all) =>
      all.map((chat) => (chat.id === id ? change(chat) : chat)),
    );
  const append = (id: string, message: Message, unread: boolean) =>
    update(id, (chat) => ({
      ...chat,
      unread: unread ? chat.unread + 1 : chat.unread,
      messages: [...chat.messages, message],
    }));

  const openThread = (id: string) => {
    update(id, (chat) => ({ ...chat, unread: 0, markedUnread: false }));
    threadX.jump(width());
    setOpenId(id);
    animate(threadX, 0, OPEN_SPRING);
  };
  const closeThread = (velocity = 0) => {
    animate(threadX, width(), { ...CLOSE_SPRING, velocity }).then(() => {
      // Unless fingers took it back on the way.
      if (threadX.get() < width() - 1) return;
      threadX.jump(AWAY);
      setOpenId(undefined);
    });
  };

  const open = chats.find((chat) => chat.id === openId);

  return (
    <GestureZone
      ref={root}
      className="fixed inset-0 overflow-hidden bg-background text-foreground"
    >
      <appTheme.StatusBar />
      <motion.div
        className="absolute inset-0"
        style={{ x: listX }}
        inert={open !== undefined}
      >
        <List
          chats={sortChats(chats)}
          onMenu={() => setMenuOpen(true)}
          onSelect={openThread}
          onRefresh={async () => {
            await wait(900);
            const next = INCOMING[arrivals.current++ % INCOMING.length];
            if (next === undefined) return;
            append(
              next.chat,
              {
                id: `${next.chat}-${Date.now()}`,
                side: 'them',
                text: next.text,
                at: Date.now(),
                ...(next.author === undefined ? {} : { author: next.author }),
              },
              true,
            );
          }}
          onPin={(id) =>
            update(id, (chat) => ({ ...chat, pinned: !chat.pinned }))
          }
          onDelete={(id) =>
            setChats((all) => all.filter((chat) => chat.id !== id))
          }
          onToggleUnread={(id) =>
            update(id, (chat) =>
              chat.unread === 0 && !chat.markedUnread
                ? { ...chat, markedUnread: true }
                : { ...chat, unread: 0, markedUnread: false },
            )
          }
        />
        <motion.div
          className="pointer-events-none absolute inset-0 bg-black/25"
          style={{ opacity: dim }}
        />
      </motion.div>
      {open === undefined ? null : (
        <Thread
          key={open.id}
          chat={open}
          x={threadX}
          onClose={closeThread}
          onStay={(velocity = 0) =>
            animate(threadX, 0, { ...OPEN_SPRING, velocity })
          }
          onSend={(text: string, replyTo: Quote | undefined) =>
            append(
              open.id,
              {
                id: `${open.id}-${Date.now()}`,
                side: 'me',
                text,
                at: Date.now(),
                ...(replyTo === undefined ? {} : { replyTo }),
              },
              false,
            )
          }
          onReact={(message, reaction) =>
            update(open.id, (chat) => ({
              ...chat,
              messages: chat.messages.map((m) => {
                if (m.id !== message) return m;
                const { reaction: _old, ...rest } = m;
                return reaction === undefined ? rest : { ...rest, reaction };
              }),
            }))
          }
        />
      )}
      <Sidebar
        open={menuOpen}
        onOpenChange={setMenuOpen}
        enabled={open === undefined}
      />
    </GestureZone>
  );
}
