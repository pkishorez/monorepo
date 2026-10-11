import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Room, RoomView } from '@/demos/concepts/children';
import { ConceptPage } from '@/demos/concepts/page';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Room, RoomView, Layer.empty);

export const Route = createFileRoute('/demos/concepts/children')({
  component: () => <ConceptPage app={App} menu={<DemoMenu />} />,
  head: ({ match }) => demoHead(match.fullPath),
});
