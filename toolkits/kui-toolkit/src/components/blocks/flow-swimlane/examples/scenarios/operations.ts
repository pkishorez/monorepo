import { Effect } from 'effect';
import { Activation, Flow } from '@pkishorez/flow';
import type { FlowScenario } from './scenarios';

const fileUpload = (): FlowScenario => ({
  id: 'upload-701',
  title: 'File upload and malware scan',
  program: () => {
    const flow = Flow.make({ id: 'upload-701' });
    const browser = flow.participant('browser');
    const api = flow.participant('upload-api');
    const storage = flow.participant('object-storage');
    const scanner = flow.participant('scanner');
    return Effect.gen(function* () {
      const activation = yield* api.activation.start('Upload');
      yield* browser.event('Read file');
      yield* browser.send(api, 'Start multipart upload');
      yield* api.event('Stream chunks');
      yield* api.send(storage, 'Commit object');
      yield* storage.send(scanner, 'Object created');
      yield* scanner.activated('Scan content')(Effect.sleep('6 millis'));
      yield* scanner.check('No threats detected', true);
      yield* scanner.send(api, 'File approved');
      yield* api.send(browser, 'Upload available');
      yield* activation.end(Activation.completed());
    });
  },
});

const retryDeadLetter = (): FlowScenario => ({
  id: 'job-retry-702',
  title: 'Job retries to dead letter',
  program: () => {
    const flow = Flow.make({ id: 'job-retry-702' });
    const scheduler = flow.participant('scheduler');
    const worker = flow.participant('worker');
    const deadLetter = flow.participant('dead-letter-queue');
    const failAttempt = (name: string) =>
      Effect.fail('upstream unavailable').pipe(
        Effect.withSpan(name),
        Effect.tapError((error) =>
          worker.event(name, { severity: 'error', attributes: { error } }),
        ),
        Effect.ignore,
      );
    return Effect.gen(function* () {
      const activation = yield* worker.activation.start('Job execution');
      yield* scheduler.send(worker, 'Execute report job');
      yield* failAttempt('Attempt 1');
      yield* worker.send(scheduler, 'Retry requested');
      yield* scheduler.waiting('backoff 30 seconds')(Effect.sleep('2 millis'));
      yield* scheduler.send(worker, 'Execute retry 2');
      yield* failAttempt('Attempt 2');
      yield* worker.send(scheduler, 'Final retry requested');
      yield* scheduler.send(worker, 'Execute retry 3');
      yield* failAttempt('Attempt 3');
      yield* worker.send(deadLetter, 'Quarantine failed job');
      yield* deadLetter.event('Job retained for inspection', {
        severity: 'error',
      });
      yield* activation.end(Activation.failed('scenario failed'));
    });
  },
});

const iotAlert = (): FlowScenario => ({
  id: 'iot-alert-703',
  title: 'IoT alert escalation',
  program: () => {
    const flow = Flow.make({ id: 'iot-alert-703' });
    const sensor = flow.participant('temperature-sensor');
    const broker = flow.participant('message-broker');
    const rules = flow.participant('rules-engine');
    const onCall = flow.participant('on-call');
    return Effect.gen(function* () {
      const activation = yield* rules.activation.start('Alert window');
      yield* sensor.event('Sample temperature');
      yield* sensor.check('Temperature below 90°C', false);
      yield* sensor.send(broker, 'Publish sensor reading');
      yield* broker.event('Route reading');
      yield* broker.send(rules, 'Evaluate threshold');
      yield* rules.event('Match alert rule');
      const page = yield* rules.send(onCall, 'Page critical alert');
      yield* onCall.event('Alert acknowledged');
      yield* onCall.reply(page, 'Cooling system inspected');
      yield* activation.end(Activation.completed());
    });
  },
});

const sagaCompensation = (): FlowScenario => ({
  id: 'saga-704',
  title: 'Saga compensation',
  program: () => {
    const flow = Flow.make({ id: 'saga-704' });
    const coordinator = flow.participant('saga-coordinator');
    const orders = flow.participant('orders');
    const payments = flow.participant('payments');
    const inventory = flow.participant('inventory');
    return Effect.gen(function* () {
      const activation = yield* coordinator.activation.start('Saga');
      const create = yield* coordinator.send(orders, 'Create pending order');
      yield* orders.event('Create order');
      yield* orders.reply(create, 'Order created');
      const capture = yield* coordinator.send(payments, 'Capture payment');
      yield* payments.activated('Capture funds')(Effect.sleep('3 millis'));
      yield* payments.reply(capture, 'Payment captured');
      const reserve = yield* coordinator.send(inventory, 'Reserve stock');
      yield* Effect.fail('stock unavailable').pipe(
        inventory.activated('Reserve inventory'),
        Effect.ignore,
      );
      yield* inventory.reply(reserve, 'Reservation failed', {
        severity: 'error',
      });
      yield* coordinator.event('Starting compensation', {
        severity: 'warning',
      });
      yield* coordinator.send(payments, 'Refund payment');
      yield* payments.activated('Refund funds')(Effect.sleep('2 millis'));
      yield* coordinator.send(orders, 'Cancel pending order');
      yield* orders.event('Order cancelled');
      yield* activation.end(Activation.failed('scenario failed'));
    });
  },
});

export const operationScenarios = [
  fileUpload(),
  retryDeadLetter(),
  iotAlert(),
  sagaCompensation(),
] as const;
