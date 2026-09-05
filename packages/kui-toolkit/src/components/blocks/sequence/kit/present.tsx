import type { ReactNode } from 'react';

import type { HTMLMotionProps } from 'motion/react';

import { AnimatePresence } from '#lib/motion';

import { Div } from './div';
import { enter, type EnterPreset, exit, type ExitPreset } from './presets';

/**
 * The single primitive for any nested conditional or swapping element — so a
 * nested element's presence "just works" without each author re-wiring
 * `AnimatePresence` + `initial`/`animate`/`exit` by hand.
 *
 * Two modes, one component:
 * - **Conditional mount** — `<Present when={cond}>`: mounts/unmounts with the
 *   chosen presets as `cond` flips.
 * - **Swap** — `<Present swapKey={value} mode="wait">`: when `swapKey` changes,
 *   the old child exits and the new one enters (the caption / label pattern).
 *
 * Entry comes from an `enter` preset, exit from an `exit` preset — never raw
 * motion variants. Duration is inherited from `<Screen speed>` via {@link Div}.
 * All other motion props (`layout`, `layoutId`, `style`, `className`,
 * `transition`) pass straight through to the inner {@link Div}.
 */
export function Present({
  when = true,
  swapKey,
  enter: enterPreset = 'fade',
  exit: exitPreset = 'fade',
  mode,
  children,
  ...rest
}: {
  /** Render the child while true; animate it out when it flips to false. */
  when?: boolean;
  /** Change this to swap the child: old exits, new enters (pair with `mode`). */
  swapKey?: string | number;
  enter?: EnterPreset;
  exit?: ExitPreset;
  /** `AnimatePresence` mode — `'wait'` sequences swaps; omit to overlap. */
  mode?: 'sync' | 'wait' | 'popLayout';
  children: ReactNode;
} & Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'exit'>) {
  return (
    <AnimatePresence mode={mode}>
      {when && (
        <Div
          key={swapKey}
          {...enter[enterPreset]}
          exit={exit[exitPreset]}
          {...rest}
        >
          {children}
        </Div>
      )}
    </AnimatePresence>
  );
}
