import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Dice, DiceView } from '@/demos/concepts/commands';
import { ConceptPage } from '@/demos/concepts/page';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Dice, DiceView, Layer.empty);

export const Route = createFileRoute('/demos/concepts/commands')({
  component: () => <ConceptPage app={App} menu={<DemoMenu />} />,
  head: ({ match }) => demoHead(match.fullPath),
});
