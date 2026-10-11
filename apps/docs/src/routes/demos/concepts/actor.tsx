import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Counter, CounterView } from '@/demos/concepts/actor';
import { ConceptPage } from '@/demos/concepts/page';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Counter, CounterView, Layer.empty);

export const Route = createFileRoute('/demos/concepts/actor')({
  component: () => <ConceptPage app={App} menu={<DemoMenu />} />,
  head: ({ match }) => demoHead(match.fullPath),
});
