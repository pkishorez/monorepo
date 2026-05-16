import { Layer, ManagedRuntime } from 'effect';
import { RollupService } from './rollup';
import { createTracerWatcher } from '@monorepo/trace-viewer';

const { TracerLayer, ref } = createTracerWatcher();
export const runtime = ManagedRuntime.make(
  RollupService.Default.pipe(Layer.merge(TracerLayer)),
);

export const tracerRef = ref;
