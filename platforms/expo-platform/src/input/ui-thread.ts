import {
  createGestureProvider,
  type GestureListener,
  type PointerSink,
} from '@kstackz/use-gesture';

/** The part of a Gesture Handler touch event the UI thread reads. */
type TouchEvent = {
  readonly changedTouches: ReadonlyArray<{
    readonly id: number;
    readonly absoluteX: number;
    readonly absoluteY: number;
  }>;
};

/** What a surface's provider on the UI thread does for it. */
type Runner = {
  readonly sink: PointerSink<null>;
  readonly add: (key: number, listener: GestureListener<null>) => void;
  readonly remove: (key: number) => void;
};

// The one zone of a UI-thread provider: the whole surface.
const SURFACE = 'surface';

// Each surface's runner, by its id, on the UI runtime's own global: a
// worklet only gets copies of what it closes over, so what lives across
// touches lives here.
const runners = (): Map<number, Runner> => {
  'worklet';
  const host = globalThis as { __gestureRunners?: Map<number, Runner> };
  host.__gestureRunners ??= new Map();
  return host.__gestureRunners;
};

// A use-gesture provider with one zone, the surface, and its listeners by key.
const createRunner = (): Runner => {
  'worklet';
  const provider = createGestureProvider<string, null>({
    zoneOf: () => SURFACE,
    parentOf: () => null,
    trapped: () => false,
  });
  provider.addZone(SURFACE);
  const removals = new Map<number, () => void>();
  return {
    sink: provider.sink,
    add: (key, listener) => {
      removals.get(key)?.();
      removals.set(key, provider.addGesture(SURFACE, listener));
    },
    remove: (key) => {
      removals.get(key)?.();
      removals.delete(key);
    },
  };
};

/**
 * The surface `id`'s provider on the UI thread, made on first use: listeners
 * that must answer a finger in the frame it moves hear the surface here,
 * fed straight from Gesture Handler's callbacks. It has one zone, the
 * surface's own; which zone takes a touch is decided on the JS thread, by
 * the surface's own provider, so its listeners should only watch, and
 * claim.
 */
export const runnerOn = (id: number): Runner => {
  'worklet';
  const all = runners();
  const found = all.get(id);
  if (found !== undefined) return found;
  const made = createRunner();
  all.set(id, made);
  return made;
};

/** Forgets the surface `id`'s provider on the UI thread. */
export const dropRunner = (id: number) => {
  'worklet';
  runners().get(id)?.sink.cancelAll(0);
  runners().delete(id);
};

/**
 * Feeds the surface `id`'s UI-thread provider the fingers of one Gesture
 * Handler touch event, at `t` ms.
 */
export const feedOn = (
  id: number,
  kind: 'down' | 'move' | 'up',
  event: TouchEvent,
  t: number,
) => {
  'worklet';
  const sink = runnerOn(id).sink;
  for (const touch of event.changedTouches) {
    sink[kind]({
      id: touch.id,
      x: touch.absoluteX,
      y: touch.absoluteY,
      t,
      target: null,
    });
  }
};
