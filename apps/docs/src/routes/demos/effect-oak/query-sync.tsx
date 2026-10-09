import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  BrowserUrl,
  QuerySync,
  QuerySyncView,
} from '@/demos/effect-oak/query-sync';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app the page's URL, read and written in place. */
const App = toReact(QuerySync, QuerySyncView, BrowserUrl);

export const Route = createFileRoute('/demos/effect-oak/query-sync')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
