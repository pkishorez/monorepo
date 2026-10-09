import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import { Todos, TodosView, TodoStoreLive } from '@/demos/effect-oak/todo';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its TodoStore: the browser's localStorage. */
const App = toReact(Todos, TodosView, TodoStoreLive);

export const Route = createFileRoute('/demos/effect-oak/todo')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
