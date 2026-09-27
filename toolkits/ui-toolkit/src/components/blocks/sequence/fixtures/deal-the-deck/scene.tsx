import { Div, type Canvas } from '../../index';

import { DECK } from './model';

/**
 * Renders one frame of the deal: `dealt` cards fanned in hand, the rest stacked
 * in the deck. Cards persist across frames via `layoutId`; their fan rotation
 * and lift live on an inner `Div` so the transform doesn't fight the layout
 * projection.
 */
export const deal = ({ dealt }: { dealt: number }, { cw }: Canvas) => {
  const inHand = DECK.slice(0, dealt);
  const inDeck = DECK.slice(dealt);
  const mid = (inHand.length - 1) / 2;
  return (
    <div className="flex w-full max-w-[calc(61.8*var(--u))] items-center justify-around">
      <div className="relative h-[calc(16.2*var(--u))] w-[calc(10.3*var(--u))]">
        {inDeck.map((c, i) => (
          <Div
            key={c}
            layoutId={`card-${c}`}
            style={{ top: cw(i * 0.18), left: cw(i * 0.18) }}
            className="absolute h-[calc(14.7*var(--u))] w-[calc(10.3*var(--u))] rounded-[calc(1.1*var(--u))] border border-white/20 bg-gradient-to-br from-indigo-600 to-violet-700 shadow-lg"
          />
        ))}
      </div>
      <div className="flex h-[calc(16.2*var(--u))] items-center gap-[calc(0.4*var(--u))]">
        {inHand.map((c, i) => (
          // layoutId handles position/size; rotation lives on an inner Div so
          // it doesn't fight the layout projection (which would twitch at the end).
          <Div
            key={c}
            layoutId={`card-${c}`}
            className="h-[calc(14.7*var(--u))] w-[calc(10.3*var(--u))]"
          >
            <Div
              initial={false}
              animate={{ rotate: (i - mid) * 10, y: Math.abs(i - mid) * 14 }}
              className="flex h-full w-full items-center justify-center rounded-[calc(1.1*var(--u))] border border-border bg-gradient-to-br from-card to-muted text-[calc(2.8*var(--u))] font-bold text-foreground shadow-xl"
            >
              {c + 1}
            </Div>
          </Div>
        ))}
      </div>
    </div>
  );
};
