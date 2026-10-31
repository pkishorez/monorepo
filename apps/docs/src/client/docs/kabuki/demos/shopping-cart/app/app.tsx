import { View } from '@kestack/kabuki/react';
import { ShopView } from './shop-view.tsx';

// The Shop and its View, as one React component: <ShopApp />. The Shop
// provides the Basket itself, so the app needs nothing from outside.
export const ShopApp = View.app(ShopView, { name: 'demo:shopping-cart' });
