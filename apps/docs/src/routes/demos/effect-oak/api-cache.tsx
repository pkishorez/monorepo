import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import { ApiCache, ApiCacheView, BlogLive } from '@/demos/effect-oak/api-cache';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its Blog: a fake server in the browser. */
const App = toReact(ApiCache, ApiCacheView, BlogLive);

export const Route = createFileRoute('/demos/effect-oak/api-cache')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
