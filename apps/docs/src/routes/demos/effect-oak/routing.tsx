import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import { Routing, RoutingLive, RoutingView } from '@/demos/effect-oak/routing';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its Location: the path after the `#`. */
const App = toReact(Routing, RoutingView, RoutingLive);

export const Route = createFileRoute('/demos/effect-oak/routing')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
