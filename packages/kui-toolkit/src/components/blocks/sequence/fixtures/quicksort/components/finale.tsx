import { type Canvas, Div, enter } from '../../../index';
import { type QBar, PALETTE, barHeight, shadow } from '../model';

/**
 * The closing frame: a gradient banner over the now-sorted bars. The bars are
 * persistent (carried in by `layoutId` from the previous frame), so only their
 * paint animates to the `sorted` role.
 */
export const quickFinale = (
  { order, text }: { order: QBar[]; text: string },
  { cw }: Canvas,
) => (
  <div className="flex flex-col items-center gap-[calc(2.2*var(--u))]">
    <Div
      className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-[calc(2.8*var(--u))] font-bold text-transparent"
      {...enter.text}
    >
      {text}
    </Div>
    <div className="flex items-end gap-[calc(1.1*var(--u))]">
      {order.map((b) => (
        // Height stays a plain style; `layout` carries each bar in from its
        // previous frame while only paint (color/shadow) animates.
        <Div
          key={b.id}
          layoutId={`q-${b.id}`}
          layout
          style={{ height: barHeight(cw, b.value) }}
          initial={false}
          animate={{
            backgroundColor: PALETTE.sorted,
            boxShadow: shadow.sorted,
          }}
          className="flex w-[calc(5.1*var(--u))] items-end justify-center rounded-[calc(1.1*var(--u))] pb-[calc(0.7*var(--u))] text-[calc(1.3*var(--u))] font-semibold text-white"
        >
          {b.value}
        </Div>
      ))}
    </div>
  </div>
);
