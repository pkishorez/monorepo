import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  Chat,
  ChatView,
  ChatServerLive,
} from '@/demos/effect-oak/websocket-chat';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its ChatServer: Postman's public echo socket. */
const App = toReact(Chat, ChatView, ChatServerLive);

export const Route = createFileRoute('/demos/effect-oak/websocket-chat')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
