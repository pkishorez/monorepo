import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import { Board, BoardView, BoardStoreLive } from '@/demos/effect-oak/kanban';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its BoardStore: the browser's localStorage. */
const App = toReact(Board, BoardView, BoardStoreLive);

export const Route = createFileRoute('/demos/effect-oak/kanban')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
