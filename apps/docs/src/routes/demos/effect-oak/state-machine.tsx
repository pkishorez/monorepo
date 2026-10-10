import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Checkout, CheckoutView } from '@/demos/effect-oak/state-machine';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The checkout needs no Services. */
const App = toReact(Checkout, CheckoutView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/state-machine')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
