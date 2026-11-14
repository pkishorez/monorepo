import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import { layerOn } from '../../platform/index.ts';

/** How hard a tap lands. */
export type Weight = 'light' | 'medium' | 'heavy';

/** How something ended. */
export type Outcome = 'success' | 'warning' | 'error';

/**
 * What a hand feels in answer to a touch. Each is `true` once the device
 * took it, and `false` where it has no way to: nothing fails.
 */
export interface HapticsService {
  /** One tap: something was pressed, armed or dropped. */
  readonly impact: (weight: Weight) => Effect.Effect<boolean>;
  /** How something ended. */
  readonly notify: (outcome: Outcome) => Effect.Effect<boolean>;
  /** One step through a list. */
  readonly selection: Effect.Effect<boolean>;
}

const IMPACT: Readonly<Record<Weight, number>> = {
  light: 8,
  medium: 16,
  heavy: 28,
};

const NOTIFY: Readonly<Record<Outcome, ReadonlyArray<number>>> = {
  success: [8, 60, 14],
  warning: [16, 50, 16],
  error: [20, 40, 20, 40, 20],
};

// The browser buzzes only once the page was touched, and says so with `false`.
const vibrate = (pattern: number | ReadonlyArray<number>) =>
  Effect.sync(() => {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator))
      return false;
    return navigator.vibrate(
      typeof pattern === 'number' ? pattern : [...pattern],
    );
  });

/** The browser's own: `navigator.vibrate`, which Android has and iOS Safari does not. */
const web: HapticsService = {
  impact: (weight) => vibrate(IMPACT[weight]),
  notify: (outcome) => vibrate(NOTIFY[outcome]),
  selection: vibrate(4),
};

const Capability = Context.Reference<HapticsService>(
  '@kestack/web-platform/capabilities/Haptics',
  { defaultValue: () => web },
);

/**
 * Haptics, the browser's unless an app says otherwise: with nothing
 * provided it is `navigator.vibrate`. `Haptics.layer({ ios })` makes it the
 * platform's own in the app's shell there.
 */
export const Haptics = Object.assign(Capability, {
  layer: layerOn(Capability),
});
