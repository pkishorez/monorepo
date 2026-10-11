import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { ConceptPage } from '@/demos/concepts/page';
import { Clock, ClockView } from '@/demos/concepts/workers';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Clock, ClockView, Layer.empty);

export const Route = createFileRoute('/demos/concepts/workers')({
  component: () => <ConceptPage app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
