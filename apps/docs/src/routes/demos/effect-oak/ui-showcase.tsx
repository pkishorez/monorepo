import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { UiShowcase, UiShowcaseView } from '@/demos/effect-oak/ui-showcase';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** Every Service the components need, Picks, is Provided by the showcase. */
const App = toReact(UiShowcase, UiShowcaseView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/ui-showcase')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
