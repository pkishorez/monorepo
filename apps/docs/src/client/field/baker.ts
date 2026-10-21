import type { BakedShape, Baking } from './bake.worker.ts';
import type { Log } from './debug.ts';
import { bake } from './shapes/index.ts';
import type { Baked, ShapeName } from './shapes/index.ts';

/*
 * Bakes the shapes named and hands each over as it is ready, by its place
 * in the list, the first first. The work runs in a Worker, so the page
 * never stalls on it. If the Worker cannot start, fails to load, errs, or
 * goes quiet (no first shape within 1.5 s, or no next one within 4 s), it
 * is stopped and the rest is baked here, one shape per task: whenever
 * WebGL2 works, the page gets its field.
 */

/** How long to wait for the first shape, then for each next one. */
const FIRST = 1500;
const NEXT = 4000;

export function startBaking(
  count: number,
  names: readonly ShapeName[],
  ready: (index: number, shape: Baked) => void,
  log: Log,
): () => void {
  const done = new Set<number>();
  let stopped = false;
  let timer = 0;
  let watchdog = 0;
  let worker: Worker | undefined;

  const take = (index: number, shape: Baked) => {
    if (stopped || done.has(index)) return;
    done.add(index);
    log.debug(`shape ${names[index]} ready (${done.size}/${names.length})`);
    ready(index, shape);
  };

  const here = () => {
    if (stopped) return;
    const next = names.findIndex((_, index) => !done.has(index));
    if (next < 0) return;
    take(next, bake(names[next]!, count));
    timer = window.setTimeout(here, 16);
  };

  // Gives up on the Worker, once, says why, and carries on here.
  let fell = false;
  const fallBack = (why: string) => {
    window.clearTimeout(watchdog);
    worker?.terminate();
    worker = undefined;
    if (fell || stopped) return;
    fell = true;
    log.warn(`bake worker ${why}; baking on the main thread`);
    here();
  };
  const watch = (ms: number) => {
    window.clearTimeout(watchdog);
    if (done.size < names.length)
      watchdog = window.setTimeout(
        () => fallBack(`sent nothing for ${ms} ms`),
        ms,
      );
  };

  try {
    worker = new Worker(new URL('./bake.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<BakedShape>) => {
      take(e.data.index, { pos: e.data.pos, aux: e.data.aux });
      watch(NEXT);
    };
    worker.onerror = (e) => {
      log.error(
        'bake worker error:',
        e.message || '(no message: it likely failed to load)',
        e.filename ?? '',
      );
      fallBack('failed to load or threw');
    };
    worker.onmessageerror = () =>
      fallBack('sent a shape that could not be read');
    const job: Baking = { count, names };
    worker.postMessage(job);
    log.debug('bake worker started for', names.join(', '));
    watch(FIRST);
  } catch (e) {
    log.error('bake worker could not start:', e);
    fallBack('could not start');
  }

  return () => {
    stopped = true;
    worker?.terminate();
    window.clearTimeout(timer);
    window.clearTimeout(watchdog);
  };
}
