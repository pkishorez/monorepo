import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import {
  WebComponents,
  WebComponentsView,
} from '@/demos/effect-oak/web-components';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The app needs no Services, so its Layer is empty. */
const App = toReact(WebComponents, WebComponentsView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/web-components')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
