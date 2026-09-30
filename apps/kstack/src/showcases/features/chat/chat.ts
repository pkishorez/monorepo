import { MessageCircleIcon } from '@kstackz/ui-toolkit/lucide';
import { codeFiles, type Feature } from '../feature.ts';
import { ChatApp } from './app.tsx';

/** A phone-first messenger: a chat list, a sidebar, and threads that slide over it. */
export const chat: Feature = {
  slug: 'chat',
  title: 'Chat',
  icon: MessageCircleIcon,
  tries: [
    'Swipe a chat left for Pin and Delete, or right past the blue to mark it unread.',
    'Swipe right on the header or from the left edge: the sidebar opens. On a row, the row wins.',
    'Pull the list down from the top: it refreshes, and a new message arrives.',
    'Open a chat, then swipe right from the left edge: the thread follows your finger back.',
    'Swipe a message right: past the snap, it is quoted in the composer. From the edge, it is back instead.',
    'Swipe the thread left: every time shows, and springs away on release.',
    'Hold a message still: reactions open. Scroll or move first, and nothing opens.',
    'Drag inside the text field: it selects text, and no gesture starts.',
  ],
  App: ChatApp,
  files: codeFiles(
    'chat',
    import.meta.glob('./*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
};
