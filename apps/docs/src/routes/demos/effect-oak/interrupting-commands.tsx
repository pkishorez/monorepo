import { createFileRoute } from '@tanstack/react-router';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Uploads, UploadsView } from '@/demos/effect-oak/interrupting-commands';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

const App = toReact(Uploads, UploadsView, Layer.empty);

export const Route = createFileRoute('/demos/effect-oak/interrupting-commands')(
  {
    component: () => <Shell app={App} menu={<DemoMenu />} />,
    ssr: false,
    head: ({ match }) => demoHead(match.fullPath),
  },
);
