import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Counters, CountersView } from '@/demos/effect-oak/counters';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Counters, CountersView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/counters')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
