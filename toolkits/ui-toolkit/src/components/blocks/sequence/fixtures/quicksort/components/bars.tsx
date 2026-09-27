import { AnimatePresence, type Canvas, Div, enter, exit } from '../../../index';
import { type BarsProps, PALETTE, barHeight, shadow } from '../model';

/** Resolve a bar's paint (colour + shadow) from its partition role this frame. */
function quickColor(
  id: string,
  pivot: string | null,
  less: string[],
  greater: string[],
  sorted: string[],
) {
  if (sorted.includes(id))
    return { backgroundColor: PALETTE.sorted, boxShadow: shadow.sorted };
  if (id === pivot)
    return { backgroundColor: PALETTE.pivot, boxShadow: shadow.pivot };
  if (less.includes(id))
    return { backgroundColor: PALETTE.less, boxShadow: shadow.rest };
  if (greater.includes(id))
    return { backgroundColor: PALETTE.greater, boxShadow: shadow.rest };
  return { backgroundColor: PALETTE.slate, boxShadow: shadow.rest };
}

/**
 * A reordering list of bars under `<AnimatePresence mode="popLayout">`. Each bar
 * carries through reorders by stable `layoutId` + `layout`, while its paint
 * cross-fades as its partition role changes frame to frame.
 */
export const quickBars = (
  { order, pivot, less, greater, sorted }: BarsProps,
  { cw }: Canvas,
) => (
  <div className="flex items-end gap-[calc(1.1*var(--u))]">
    <AnimatePresence mode="popLayout">
      {order.map((b) => (
        // Height is a plain style, not an animated prop: a bar's value never
        // changes across steps, so `layout` (driven by position/reorder) is the
        // sole driver of its box — no `height`-vs-`layout` fight to jitter.
        <Div
          key={b.id}
          layoutId={`q-${b.id}`}
          layout
          style={{ height: barHeight(cw, b.value) }}
          initial={enter.pop.initial}
          animate={{
            ...enter.pop.animate,
            ...quickColor(b.id, pivot, less, greater, sorted),
          }}
          exit={exit.pop}
          className="flex w-[calc(5.1*var(--u))] items-end justify-center rounded-[calc(1.1*var(--u))] pb-[calc(0.7*var(--u))] text-[calc(1.3*var(--u))] font-semibold text-white"
        >
          {b.value}
        </Div>
      ))}
    </AnimatePresence>
  </div>
);
