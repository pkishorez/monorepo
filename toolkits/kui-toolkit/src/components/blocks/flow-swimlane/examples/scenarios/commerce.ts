import { Effect } from 'effect';
import { Activation, Flow } from '@pkishorez/flow';
import type { FlowScenario } from './scenarios';

const checkoutSuccess = (): FlowScenario => ({
  id: 'checkout-501',
  title: 'Checkout succeeds',
  program: () => {
    const flow = Flow.make({ id: 'checkout-501' });
    const browser = flow.participant('browser');
    const checkout = flow.participant('checkout-api');
    const inventory = flow.participant('inventory');
    const payments = flow.participant('payments');
    return Effect.gen(function* () {
      const activation = yield* checkout.activation.start('Checkout');
      yield* browser.send(checkout, 'Submit cart');
      yield* checkout.event('Validate cart');
      const reserve = yield* checkout.send(inventory, 'Reserve items');
      yield* inventory.activated('Reserve stock')(Effect.sleep('4 millis'));
      yield* inventory.reply(reserve, 'Stock reserved');
      const charge = yield* checkout.send(payments, 'Authorize payment');
      yield* payments.activated('Charge card')(Effect.sleep('5 millis'));
      yield* payments.reply(charge, 'Payment authorized');
      yield* checkout.send(browser, 'Order confirmed');
      yield* activation.end(Activation.completed());
      yield* checkout.close();
    });
  },
});

const paymentDecline = (): FlowScenario => ({
  id: 'payment-502',
  title: 'Payment is declined',
  program: () => {
    const flow = Flow.make({ id: 'payment-502' });
    const checkout = flow.participant('checkout-api');
    const gateway = flow.participant('payment-gateway');
    const browser = flow.participant('browser');
    return Effect.gen(function* () {
      const activation = yield* checkout.activation.start('Checkout');
      yield* checkout.send(gateway, 'Authorize card');
      yield* Effect.fail('insufficient funds').pipe(
        Effect.withSpan('issuer.authorize'),
        gateway.activated('Authorize payment'),
        Effect.ignore,
      );
      yield* gateway.event('Issuer declined transaction', {
        severity: 'error',
      });
      yield* gateway.send(checkout, 'Payment declined');
      yield* checkout.send(browser, 'Choose another payment method');
      yield* browser.event('Payment form reopened', { severity: 'warning' });
      yield* activation.end(Activation.failed('scenario failed'));
    });
  },
});

const orderFulfillment = (): FlowScenario => ({
  id: 'order-fulfillment-503',
  title: 'Order fulfillment',
  program: () => {
    const flow = Flow.make({ id: 'order-fulfillment-503' });
    const orders = flow.participant('orders');
    const warehouse = flow.participant('warehouse');
    const shipping = flow.participant('shipping');
    const customer = flow.participant('customer');
    return Effect.gen(function* () {
      const activation = yield* orders.activation.start('Fulfillment');
      yield* orders.event('Create order');
      yield* orders.send(warehouse, 'Request fulfillment');
      yield* warehouse.activated('Pick and pack')(Effect.sleep('5 millis'));
      const label = yield* warehouse.send(shipping, 'Parcel ready');
      yield* shipping.event('Buy label');
      yield* shipping.reply(label, 'Tracking assigned');
      yield* warehouse.send(orders, 'Order shipped');
      yield* shipping.send(customer, 'Delivery notification');
      yield* customer.event('Tracking link displayed');
      yield* activation.end(Activation.completed());
    });
  },
});

export const commerceScenarios = [
  checkoutSuccess(),
  paymentDecline(),
  orderFulfillment(),
] as const;
