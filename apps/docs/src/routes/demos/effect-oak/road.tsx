import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Game, GameView } from '@/demos/effect-oak/game';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The whole app: one Node, no Services, one React component. */
const App = toReact(Game, GameView, Layer.empty);

const Road = () => <Shell app={App} menu={<DemoMenu />} />;

export const Route = createFileRoute('/demos/effect-oak/road')({
  component: Road,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
