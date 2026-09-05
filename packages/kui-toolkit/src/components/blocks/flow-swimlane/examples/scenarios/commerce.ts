import { Effect } from 'effect';
import { Activation, initFlow } from '@pkishorez/effect-tracer/flow';
import type { FlowScenario } from './scenarios';

const checkoutSuccess = (): FlowScenario => ({
  id: 'checkout-501',
  title: 'Checkout succeeds',
  program: () => {
    const browser = initFlow({
      id: 'checkout-501',
      participantName: 'browser',
    });
    const checkout = initFlow({
      id: 'checkout-501',
      participantName: 'checkout-api',
    });
    const inventory = initFlow({
      id: 'checkout-501',
      participantName: 'inventory',
    });
    const payments = initFlow({
      id: 'checkout-501',
      participantName: 'payments',
    });
    return Effect.gen(function* () {
      const activation = yield* checkout.activation.start('Checkout');
      yield* browser.send('checkout-api', 'Submit cart');
      yield* Effect.sleep('3 millis').pipe(checkout.withSpan('Validate cart'));
      yield* checkout.send('inventory', 'Reserve items');
      yield* Effect.sleep('4 millis').pipe(inventory.withSpan('Reserve stock'));
      yield* inventory.send('checkout-api', 'Stock reserved');
      yield* checkout.send('payments', 'Authorize payment');
      yield* Effect.sleep('5 millis').pipe(payments.withSpan('Charge card'));
      yield* payments.send('checkout-api', 'Payment authorized');
      yield* checkout.send('browser', 'Order confirmed');
      yield* activation.end(Activation.completed());
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
    });
    const gateway = initFlow({
      id: 'payment-502',
      participantName: 'payment-gateway',
    });
    const browser = initFlow({
      id: 'payment-502',
      participantName: 'browser',
    });
    return Effect.gen(function* () {
      const activation = yield* checkout.activation.start('Checkout');
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
      yield* activation.end(Activation.failed('scenario failed'));
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
    });
    const warehouse = initFlow({
      id: 'order-fulfillment-503',
      participantName: 'warehouse',
    });
    const shipping = initFlow({
      id: 'order-fulfillment-503',
      participantName: 'shipping',
    });
    const customer = initFlow({
      id: 'order-fulfillment-503',
      participantName: 'customer',
    });
    return Effect.gen(function* () {
      const activation = yield* orders.activation.start('Fulfillment');
      yield* Effect.sleep('2 millis').pipe(orders.withSpan('Create order'));
      yield* orders.send('warehouse', 'Request fulfillment');
      yield* Effect.sleep('5 millis').pipe(warehouse.withSpan('Pick and pack'));
      yield* warehouse.send('shipping', 'Parcel ready');
      yield* Effect.sleep('3 millis').pipe(shipping.withSpan('Buy label'));
      yield* shipping.send('warehouse', 'Tracking assigned');
      yield* warehouse.send('orders', 'Order shipped');
      yield* shipping.send('customer', 'Delivery notification');
      yield* customer.log('Tracking link displayed');
      yield* activation.end(Activation.completed());
    });
  },
});

export const commerceScenarios = [
  checkoutSuccess(),
  paymentDecline(),
  orderFulfillment(),
] as const;
