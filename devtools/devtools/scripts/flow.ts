import { Effect, Fiber } from 'effect';
import {
  Activation,
  Flow,
  type ActivationRef,
  type FlowInstance,
  type MessageToken,
} from '@pkishorez/flow';

/**
 * One Flow that exercises every capability of `@pkishorez/flow`:
 *
 * - two origins (a browser and a server runtime) writing the same Flow id,
 * - participants grouped by path, including one that only ever receives,
 * - messages, replies, and a message to a lane that never writes,
 * - scoped and manual activations with every outcome,
 * - scoped waits, manual waits, a wait closed by its activation end, a wait
 *   replaced by a second wait, and a resume with no open wait (a warning),
 * - checks that hold and one that does not,
 * - events inside spans so entries carry a trace link,
 * - a deliberate second activation start (a warning) and a close hint.
 *
 * `browserSide` and `serverSide` are meant to run in two runtimes with
 * different Flow Telemetry origins; `handoff` carries the message token across.
 */
export const flowId = `checkout:${Date.now().toString(36)}`;

export const makeFlow = (): FlowInstance => Flow.make({ id: flowId });

export interface Handoff {
  readonly submit: MessageToken;
}

/** What the browser origin records before, during, and after the server work. */
export const browserSide = (flow: FlowInstance) => {
  const user = flow.participant('browser/user');
  const app = flow.participant('browser/app');
  const cache = flow.participant('browser/app/cache');

  return {
    begin: Effect.gen(function* () {
      const session = yield* user.activation.start('Shopping session', {
        attributes: { cart: ['book', 'lamp'], total: 42 },
      });
      yield* user.event('Opened checkout');
      yield* user.check('cart is not empty', true);

      // A scoped activation with a scoped wait inside it.
      const submit = yield* app.activated('Submit order')(
        Effect.gen(function* () {
          yield* app
            .event('Validating form', {
              attributes: { fields: 4 },
            })
            .pipe(Effect.withSpan('validate-form'));
          yield* cache.waiting('reading cached address')(
            Effect.sleep('30 millis'),
          );
          yield* cache.event('Address loaded from cache', {
            severity: 'debug',
          });
          return yield* app.send('server/api', 'POST /orders', {
            attributes: { idempotencyKey: flowId },
          });
        }),
      );

      // Manual wait: the browser suspends itself until the server answers.
      yield* app.wait('waiting for the order to settle');
      return { session, submit };
    }),

    finish: (session: ActivationRef) =>
      Effect.gen(function* () {
        yield* app.resume('order settled');
        yield* app
          .event('Rendering confirmation', {
            severity: 'info',
          })
          .pipe(Effect.withSpan('render-confirmation'));

        // A wait that is never resumed: the activation end closes it.
        yield* user.wait('waiting for the user to close the tab');
        yield* session.end(Activation.completed());

        // A second start while one is open, then an end: both are warnings
        // the projector should surface.
        const late = yield* user.activation.start('Late activation');
        yield* user.activation.start('Overlapping activation');
        yield* late.end(Activation.interrupted('tab closed'));

        // A resume with no open wait: the fourth warning.
        yield* cache.resume('spurious resume');

        // A message to a lane that never writes anything.
        yield* app.send('analytics', 'checkout completed', {
          severity: 'debug',
        });
        yield* user.close('Checkout finished');
      }),
  };
};

/** What the server origin records while handling the browser's request. */
export const serverSide = (flow: FlowInstance, handoff: Handoff) => {
  const api = flow.participant('server/api');
  const payments = flow.participant('server/payments');
  const inventory = flow.participant('server/inventory');
  const worker = flow.participant('server/worker');

  return Effect.gen(function* () {
    yield* api.activated('Handle POST /orders')(
      Effect.gen(function* () {
        yield* api.event('Request accepted').pipe(
          Effect.withSpan('http.request', {
            attributes: { 'http.method': 'POST', 'http.route': '/orders' },
          }),
        );

        // Fan out to two participants, wait on both, one of them fails.
        const charge = yield* api.send(payments, 'charge card', {
          attributes: { amount: 42 },
        });
        const reserve = yield* api.send(inventory, 'reserve items');

        const paymentFiber = yield* payments
          .activated('Charge card')(
            Effect.gen(function* () {
              yield* payments.waiting('bank authorization')(
                Effect.sleep('80 millis'),
              );
              yield* payments.check('funds available', true);
              yield* payments.reply(charge, 'charged');
            }),
          )
          .pipe(Effect.forkChild);

        const inventoryFiber = yield* inventory
          .activated('Reserve items')(
            Effect.gen(function* () {
              // A wait replaced by a second wait, then resumed.
              yield* inventory.wait('locking the book shelf');
              yield* Effect.sleep('20 millis');
              yield* inventory.wait('locking the lamp shelf');
              yield* Effect.sleep('20 millis');
              yield* inventory.resume('shelves locked');
              yield* inventory.check('lamp in stock', false);
              yield* inventory.reply(reserve, 'lamp out of stock', {
                severity: 'error',
              });
              return yield* Effect.fail(new Error('lamp out of stock'));
            }),
          )
          .pipe(Effect.ignore, Effect.forkChild);

        yield* api.waiting('payments and inventory')(
          Effect.all([Fiber.join(paymentFiber), Fiber.join(inventoryFiber)]),
        );

        // Compensate: refund, then hand the retry to a background worker.
        yield* api.event('Inventory failed, refunding', {
          severity: 'warning',
        });
        const refund = yield* api.send(payments, 'refund card');
        yield* payments.activated('Refund card')(Effect.sleep('30 millis'));
        yield* payments.reply(refund, 'refunded');

        const job = yield* api.send(worker, 'schedule restock check');
        yield* worker.activated('Restock check')(
          Effect.gen(function* () {
            yield* worker.waiting('supplier feed')(Effect.sleep('40 millis'));
            yield* worker.event('Restock in 3 days');
            yield* worker.reply(job, 'scheduled');
          }),
        );

        yield* api.reply(handoff.submit, '409 lamp out of stock', {
          severity: 'error',
          attributes: { status: 409 },
        });
      }),
    );

    // A manual activation that is interrupted by supervision.
    const drain = yield* worker.activation.start('Drain queue');
    yield* worker.wait('queue empty');
    yield* drain.end(Activation.interrupted('shutdown'));
  });
};
