import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Waitlist, WaitlistView } from '@/demos/effect-oak/form';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The waitlist server is faked inside the Commands: no Services. */
const App = toReact(Waitlist, WaitlistView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/form')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
