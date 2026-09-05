import type { ReactNode } from 'react';

import type { Canvas, Step } from '../internal';

/**
 * Defines one frame of a sequence. The `props` value is both the step's
 * **default props** and the source of its **type**: `render`'s parameter is
 * inferred from it, so the contract is written once. Pass steps to
 * {@link useSteps} in display order.
 *
 * ```ts
 * step('step1', { items: ITEMS }, (p) => <Lineup {...p} />)
 * ```
 *
 * Inference narrows to literals — for union props, widen the default at the
 * call site: `step('s', { mode: 'grid' as 'grid' | 'stack' }, render)`.
 *
 * @param name   unique frame name (used to address it via `go`)
 * @param props  default props for this frame; its type becomes the contract
 * @param render turns props into JSX
 */
export function step<const N extends string, P>(
  name: N,
  props: P,
  render: (props: P, canvas: Canvas) => ReactNode,
): Step<N, P> {
  return { name, props, render };
}
