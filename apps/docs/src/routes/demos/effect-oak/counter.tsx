import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Counter, CounterView } from '@/demos/effect-oak/counter';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Counter, CounterView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/counter')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
