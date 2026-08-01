import { Metric } from 'effect';

export const threadStarted = Metric.counter('code.thread.started', {
  description: 'Threads accepted for execution',
  incremental: true,
});

export const runStarted = Metric.counter('code.run.started', {
  description: 'Runs accepted for execution',
  incremental: true,
});

export const runFinished = Metric.counter('code.run.finished', {
  description: 'Runs reaching a terminal state',
  incremental: true,
});

export const runDuration = Metric.timer('code.run.duration', {
  description: 'End-to-end harness execution duration',
});

export const runChunks = Metric.counter('code.run.chunks', {
  description: 'Harness stream chunks observed',
  incremental: true,
});

export const runInterrupts = Metric.counter('code.run.interrupts', {
  description: 'Run interruption requests',
  incremental: true,
});

export const persistenceFailures = Metric.counter(
  'code.run.persistence_failures',
  {
    description: 'Failures while persisting terminal run state',
    incremental: true,
  },
);
