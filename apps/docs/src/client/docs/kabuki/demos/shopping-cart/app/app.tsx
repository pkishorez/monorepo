import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { ShopLive } from './shop.ts';
import { ShopView } from './shop-view.tsx';

// The Shop and its View, as one React component: <ShopApp />. The Shop
// provides the Basket itself, so the app needs nothing from outside.
export const ShopApp = toReact(ShopLive, ShopView, Layer.empty, {
  name: 'demo:shopping-cart',
});
