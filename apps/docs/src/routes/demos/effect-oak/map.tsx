import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  BrowserGeolocation,
  WorldMap,
  WorldMapView,
} from '@/demos/effect-oak/map';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app the browser's geolocation. */
const App = toReact(WorldMap, WorldMapView, BrowserGeolocation);

export const Route = createFileRoute('/demos/effect-oak/map')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
