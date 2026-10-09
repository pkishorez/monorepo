import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  EnginePanel,
  EnginePanelView,
  EngineHostLive,
} from '@/demos/effect-oak/managed-resource-layer';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its EngineHost, which keeps the running engine. */
const App = toReact(EnginePanel, EnginePanelView, EngineHostLive);

export const Route = createFileRoute(
  '/demos/effect-oak/managed-resource-layer',
)({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
