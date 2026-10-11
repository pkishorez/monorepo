import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Board, BoardView } from '@/demos/concepts/capabilities';
import { ConceptPage } from '@/demos/concepts/page';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Board, BoardView, Layer.empty);

export const Route = createFileRoute('/demos/concepts/capabilities')({
  component: () => <ConceptPage app={App} menu={<DemoMenu />} />,
  head: ({ match }) => demoHead(match.fullPath),
});
