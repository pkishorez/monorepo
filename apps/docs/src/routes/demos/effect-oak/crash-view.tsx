import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { CrashDemo, CrashDemoView } from '@/demos/effect-oak/crash-view';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(CrashDemo, CrashDemoView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/crash-view')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
