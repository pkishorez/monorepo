import { Effect } from 'effect';
import { initFlow } from '@pkishorez/effect-tracer/flow';
import type { FlowScenario } from './scenarios';

const fileUpload = (): FlowScenario => ({
  id: 'upload-701',
  title: 'File upload and malware scan',
  program: () => {
    const browser = initFlow({
      id: 'upload-701',
      participantName: 'browser',
      participants: ['upload-api'] as const,
    });
    const api = initFlow({
      id: 'upload-701',
      participantName: 'upload-api',
      participants: ['object-storage', 'scanner', 'browser'] as const,
    });
    const storage = initFlow({
      id: 'upload-701',
      participantName: 'object-storage',
      participants: ['scanner'] as const,
    });
    const scanner = initFlow({
      id: 'upload-701',
      participantName: 'scanner',
      participants: ['upload-api'] as const,
    });
    return Effect.gen(function* () {
      yield* Effect.sleep('3 millis').pipe(browser.withSpan('Read file'));
      yield* browser.send('upload-api', 'Start multipart upload');
      yield* Effect.sleep('4 millis').pipe(api.withSpan('Stream chunks'));
      yield* api.send('object-storage', 'Commit object');
      yield* storage.send('scanner', 'Object created');
      yield* Effect.sleep('6 millis').pipe(scanner.withSpan('Scan content'));
      yield* scanner.log('No threats detected');
      yield* scanner.send('upload-api', 'File approved');
      yield* api.send('browser', 'Upload available');
      yield* api.end('completed', { message: 'Upload processed' });
    });
  },
});

const retryDeadLetter = (): FlowScenario => ({
  id: 'job-retry-702',
  title: 'Job retries to dead letter',
  program: () => {
    const scheduler = initFlow({
      id: 'job-retry-702',
      participantName: 'scheduler',
      participants: ['worker'] as const,
    });
    const worker = initFlow({
      id: 'job-retry-702',
      participantName: 'worker',
      participants: ['scheduler', 'dead-letter-queue'] as const,
    });
    const deadLetter = initFlow({
      id: 'job-retry-702',
      participantName: 'dead-letter-queue',
    });
    const failAttempt = (name: string) =>
      Effect.fail('upstream unavailable').pipe(
        worker.withSpan(name),
        Effect.ignore,
      );
    return Effect.gen(function* () {
      yield* scheduler.send('worker', 'Execute report job');
      yield* failAttempt('Attempt 1');
      yield* worker.send('scheduler', 'Retry requested');
      yield* scheduler.log('Backoff 30 seconds', { level: 'warning' });
      yield* scheduler.send('worker', 'Execute retry 2');
      yield* failAttempt('Attempt 2');
      yield* worker.send('scheduler', 'Final retry requested');
      yield* scheduler.send('worker', 'Execute retry 3');
      yield* failAttempt('Attempt 3');
      yield* worker.send('dead-letter-queue', 'Quarantine failed job');
      yield* deadLetter.log('Job retained for inspection', { level: 'error' });
      yield* worker.end('failed', { message: 'Retries exhausted' });
    });
  },
});

const iotAlert = (): FlowScenario => ({
  id: 'iot-alert-703',
  title: 'IoT alert escalation',
  program: () => {
    const sensor = initFlow({
      id: 'iot-alert-703',
      participantName: 'temperature-sensor',
      participants: ['message-broker'] as const,
    });
    const broker = initFlow({
      id: 'iot-alert-703',
      participantName: 'message-broker',
      participants: ['rules-engine'] as const,
    });
    const rules = initFlow({
      id: 'iot-alert-703',
      participantName: 'rules-engine',
      participants: ['on-call'] as const,
    });
    const onCall = initFlow({
      id: 'iot-alert-703',
      participantName: 'on-call',
      participants: ['rules-engine'] as const,
    });
    return Effect.gen(function* () {
      yield* Effect.sleep('2 millis').pipe(
        sensor.withSpan('Sample temperature'),
      );
      yield* sensor.log('Temperature exceeded 90°C', { level: 'warning' });
      yield* sensor.send('message-broker', 'Publish sensor reading');
      yield* Effect.sleep('2 millis').pipe(broker.withSpan('Route reading'));
      yield* broker.send('rules-engine', 'Evaluate threshold');
      yield* Effect.sleep('3 millis').pipe(rules.withSpan('Match alert rule'));
      yield* rules.send('on-call', 'Page critical alert');
      yield* onCall.log('Alert acknowledged');
      yield* onCall.send('rules-engine', 'Cooling system inspected');
      yield* rules.end('completed', { message: 'Alert resolved' });
    });
  },
});

const sagaCompensation = (): FlowScenario => ({
  id: 'saga-704',
  title: 'Saga compensation',
  program: () => {
    const coordinator = initFlow({
      id: 'saga-704',
      participantName: 'saga-coordinator',
      participants: ['orders', 'payments', 'inventory'] as const,
    });
    const orders = initFlow({
      id: 'saga-704',
      participantName: 'orders',
      participants: ['saga-coordinator'] as const,
    });
    const payments = initFlow({
      id: 'saga-704',
      participantName: 'payments',
      participants: ['saga-coordinator'] as const,
    });
    const inventory = initFlow({
      id: 'saga-704',
      participantName: 'inventory',
      participants: ['saga-coordinator'] as const,
    });
    return Effect.gen(function* () {
      yield* coordinator.send('orders', 'Create pending order');
      yield* Effect.sleep('2 millis').pipe(orders.withSpan('Create order'));
      yield* orders.send('saga-coordinator', 'Order created');
      yield* coordinator.send('payments', 'Capture payment');
      yield* Effect.sleep('3 millis').pipe(payments.withSpan('Capture funds'));
      yield* payments.send('saga-coordinator', 'Payment captured');
      yield* coordinator.send('inventory', 'Reserve stock');
      yield* Effect.fail('stock unavailable').pipe(
        inventory.withSpan('Reserve inventory'),
        Effect.ignore,
      );
      yield* inventory.send('saga-coordinator', 'Reservation failed');
      yield* coordinator.log('Starting compensation', { level: 'warning' });
      yield* coordinator.send('payments', 'Refund payment');
      yield* Effect.sleep('2 millis').pipe(payments.withSpan('Refund funds'));
      yield* coordinator.send('orders', 'Cancel pending order');
      yield* orders.log('Order cancelled');
      yield* coordinator.end('failed', { message: 'Saga compensated' });
    });
  },
});

export const operationScenarios = [
  fileUpload(),
  retryDeadLetter(),
  iotAlert(),
  sagaCompensation(),
] as const;
