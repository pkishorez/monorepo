import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  PictureStoreLive,
  PixelArt,
  PixelArtView,
} from '@/demos/effect-oak/pixel-art';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its PictureStore: the browser's localStorage. */
const App = toReact(PixelArt, PixelArtView, PictureStoreLive);

export const Route = createFileRoute('/demos/effect-oak/pixel-art')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
