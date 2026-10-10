import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  ViewTransitions,
  ViewTransitionsLive,
  ViewTransitionsView,
} from '@/demos/effect-oak/view-transitions';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its Location: the path after the `#`. */
const App = toReact(ViewTransitions, ViewTransitionsView, ViewTransitionsLive);

export const Route = createFileRoute('/demos/effect-oak/view-transitions')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
