import { Effect } from 'effect';
import { initFlow } from '@pkishorez/effect-tracer/flow';
import type { FlowScenario } from './scenarios';

const checkoutSuccess = (): FlowScenario => ({
  id: 'checkout-501',
  title: 'Checkout succeeds',
  program: () => {
    const browser = initFlow({
      id: 'checkout-501',
      participantName: 'browser',
      participants: ['checkout-api'] as const,
    });
    const checkout = initFlow({
      id: 'checkout-501',
      participantName: 'checkout-api',
      participants: ['inventory', 'payments', 'browser'] as const,
    });
    const inventory = initFlow({
      id: 'checkout-501',
      participantName: 'inventory',
      participants: ['checkout-api'] as const,
    });
    const payments = initFlow({
      id: 'checkout-501',
      participantName: 'payments',
      participants: ['checkout-api'] as const,
    });
    return Effect.gen(function* () {
      yield* browser.send('checkout-api', 'Submit cart');
      yield* Effect.sleep('3 millis').pipe(checkout.withSpan('Validate cart'));
      yield* checkout.send('inventory', 'Reserve items');
      yield* Effect.sleep('4 millis').pipe(inventory.withSpan('Reserve stock'));
      yield* inventory.send('checkout-api', 'Stock reserved');
      yield* checkout.send('payments', 'Authorize payment');
      yield* Effect.sleep('5 millis').pipe(payments.withSpan('Charge card'));
      yield* payments.send('checkout-api', 'Payment authorized');
      yield* checkout.send('browser', 'Order confirmed');
      yield* checkout.end('completed', { message: 'Checkout completed' });
    });
  },
});

const paymentDecline = (): FlowScenario => ({
  id: 'payment-502',
  title: 'Payment is declined',
  program: () => {
    const checkout = initFlow({
      id: 'payment-502',
      participantName: 'checkout-api',
      participants: ['payment-gateway', 'browser'] as const,
    });
    const gateway = initFlow({
      id: 'payment-502',
      participantName: 'payment-gateway',
      participants: ['checkout-api'] as const,
    });
    const browser = initFlow({
      id: 'payment-502',
      participantName: 'browser',
    });
    return Effect.gen(function* () {
      yield* checkout.send('payment-gateway', 'Authorize card');
      yield* Effect.fail('insufficient funds').pipe(
        Effect.withSpan('issuer.authorize'),
        gateway.withSpan('Authorize payment'),
        Effect.ignore,
      );
      yield* gateway.log('Issuer declined transaction', { level: 'error' });
      yield* gateway.send('checkout-api', 'Payment declined');
      yield* checkout.send('browser', 'Choose another payment method');
      yield* browser.log('Payment form reopened', { level: 'warning' });
      yield* checkout.end('failed', { message: 'Checkout failed' });
    });
  },
});

const orderFulfillment = (): FlowScenario => ({
  id: 'order-fulfillment-503',
  title: 'Order fulfillment',
  program: () => {
    const orders = initFlow({
      id: 'order-fulfillment-503',
      participantName: 'orders',
      participants: ['warehouse'] as const,
    });
    const warehouse = initFlow({
      id: 'order-fulfillment-503',
      participantName: 'warehouse',
      participants: ['shipping', 'orders'] as const,
    });
    const shipping = initFlow({
      id: 'order-fulfillment-503',
      participantName: 'shipping',
      participants: ['warehouse', 'customer'] as const,
    });
    const customer = initFlow({
      id: 'order-fulfillment-503',
      participantName: 'customer',
    });
    return Effect.gen(function* () {
      yield* Effect.sleep('2 millis').pipe(orders.withSpan('Create order'));
      yield* orders.send('warehouse', 'Request fulfillment');
      yield* Effect.sleep('5 millis').pipe(warehouse.withSpan('Pick and pack'));
      yield* warehouse.send('shipping', 'Parcel ready');
      yield* Effect.sleep('3 millis').pipe(shipping.withSpan('Buy label'));
      yield* shipping.send('warehouse', 'Tracking assigned');
      yield* warehouse.send('orders', 'Order shipped');
      yield* shipping.send('customer', 'Delivery notification');
      yield* customer.log('Tracking link displayed');
      yield* orders.end('completed', { message: 'Fulfillment complete' });
    });
  },
});

export const commerceScenarios = [
  checkoutSuccess(),
  paymentDecline(),
  orderFulfillment(),
] as const;
