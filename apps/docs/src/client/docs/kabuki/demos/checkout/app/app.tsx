import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { CheckoutLive } from './checkout.ts';
import { CheckoutView } from './checkout-view.tsx';

// The Checkout and its View, as one React component: <CheckoutApp />.
export const CheckoutApp = toReact(CheckoutLive, CheckoutView, Layer.empty, {
  name: 'demo:checkout',
});
