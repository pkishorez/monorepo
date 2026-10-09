import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import { Auth, AuthView, AuthLive } from '@/demos/effect-oak/auth';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its AuthServer: a fake login and the saved session. */
const App = toReact(Auth, AuthView, AuthLive);

export const Route = createFileRoute('/demos/effect-oak/auth')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
