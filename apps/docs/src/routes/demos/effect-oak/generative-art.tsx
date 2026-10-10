import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Prism, PrismView } from '@/demos/effect-oak/generative-art';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Prism, PrismView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/generative-art')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
