import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  ApiCacheQuery,
  ApiCacheQueryLive,
  ApiCacheQueryView,
} from '@/demos/effect-oak/api-cache-query';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app a fake Blog and the Orders mailboxes. */
const App = toReact(ApiCacheQuery, ApiCacheQueryView, ApiCacheQueryLive);

export const Route = createFileRoute('/demos/effect-oak/api-cache-query')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
