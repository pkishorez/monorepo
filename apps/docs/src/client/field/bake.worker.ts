import { bake } from './shapes/index.ts';
import type { ShapeName } from './shapes/index.ts';

/*
 * Bakes the shapes a page asks for off the main thread, in its order, and
 * hands each back as it is done, its numbers moved rather than copied.
 */

export type Baking = {
  readonly count: number;
  readonly names: readonly ShapeName[];
};
export type BakedShape = {
  readonly index: number;
  readonly pos: Float32Array;
  readonly aux: Float32Array;
};

const worker = self as unknown as Worker;

worker.onmessage = (e: MessageEvent<Baking>) => {
  e.data.names.forEach((name, index) => {
    const { pos, aux } = bake(name, e.data.count);
    const shape: BakedShape = { index, pos, aux };
    worker.postMessage(shape, [pos.buffer, aux.buffer]);
  });
};
