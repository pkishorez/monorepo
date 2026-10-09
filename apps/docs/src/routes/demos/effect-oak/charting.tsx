import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  Charting,
  ChartingView,
  NpmAndGitHub,
} from '@/demos/effect-oak/charting';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its Telemetry: npm and GitHub, public APIs with no key. */
const App = toReact(Charting, ChartingView, NpmAndGitHub);

export const Route = createFileRoute('/demos/effect-oak/charting')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
