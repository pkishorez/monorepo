import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { SlowLab, SlowLabView } from '@/demos/effect-oak/slow-warnings';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** No Services: the work is timed from the View. */
const App = toReact(SlowLab, SlowLabView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/slow-warnings')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
