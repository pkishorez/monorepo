import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Scoreboard, ScoreboardView } from '@/demos/concepts/keyed-children';
import { ConceptPage } from '@/demos/concepts/page';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Scoreboard, ScoreboardView, Layer.empty);

export const Route = createFileRoute('/demos/concepts/keyed-children')({
  component: () => <ConceptPage app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
