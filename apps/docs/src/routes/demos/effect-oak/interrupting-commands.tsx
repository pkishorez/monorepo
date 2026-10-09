import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  Uploads,
  UploadsView,
  UploaderLive,
} from '@/demos/effect-oak/interrupting-commands';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its Uploader, which can stop one upload by id. */
const App = toReact(Uploads, UploadsView, UploaderLive);

export const Route = createFileRoute('/demos/effect-oak/interrupting-commands')(
  {
    component: () => <Shell app={App} menu={<DemoMenu />} />,
    ssr: false,
    head: ({ match }) => demoHead(match.fullPath),
  },
);
