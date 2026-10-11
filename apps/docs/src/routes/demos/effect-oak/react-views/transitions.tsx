import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import {
  Editors,
  EditorsView,
} from '@/demos/effect-oak/react-views/transitions';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Editors, EditorsView, Layer.empty);

export const Route = createFileRoute(
  '/demos/effect-oak/react-views/transitions',
)({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
