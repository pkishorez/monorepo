import { View } from '@kestack/kabuki/react';
import { CheckoutView } from './checkout-view.tsx';

// The Checkout and its View, as one React component: <CheckoutApp />.
export const CheckoutApp = View.app(CheckoutView, { name: 'demo:checkout' });
