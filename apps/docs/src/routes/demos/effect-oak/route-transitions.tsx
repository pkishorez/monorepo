import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  RouteTransitions,
  RouteTransitionsLive,
  RouteTransitionsView,
} from '@/demos/effect-oak/route-transitions';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its Location: the path after the `#`. */
const App = toReact(
  RouteTransitions,
  RouteTransitionsView,
  RouteTransitionsLive,
);

export const Route = createFileRoute('/demos/effect-oak/route-transitions')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
