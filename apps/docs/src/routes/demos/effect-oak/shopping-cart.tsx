import { createFileRoute } from '@tanstack/react-router';
import { toReact } from 'effect-oak/react';
import {
  Shop,
  ShopView,
  ShopServerLive,
} from '@/demos/effect-oak/shopping-cart';
import { Shell } from '@/demos/effect-oak/shell';
import { DemoMenu, demoHead } from '@/lib/demos';

/** The Layer gives the app its ShopServer: a fake catalog and order desk. */
const App = toReact(Shop, ShopView, ShopServerLive);

export const Route = createFileRoute('/demos/effect-oak/shopping-cart')({
  component: () => <Shell app={App} menu={<DemoMenu />} />,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
