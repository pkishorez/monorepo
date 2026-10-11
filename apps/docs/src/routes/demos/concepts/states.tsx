import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { ConceptPage } from '@/demos/concepts/page';
import { Door, DoorView } from '@/demos/concepts/states';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Door, DoorView, Layer.empty);

export const Route = createFileRoute('/demos/concepts/states')({
  component: () => <ConceptPage app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
