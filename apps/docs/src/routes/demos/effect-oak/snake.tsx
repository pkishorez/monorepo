import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Arcade, ArcadeView } from '@/demos/effect-oak/snake';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Arcade, ArcadeView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/snake')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
