import { Div } from '../../index';

import { itemColor, itemShadow } from './model';

/** Step 1: every item in a 5-column grid, the first one already crowned amber. */
export const lineup = ({ items }: { items: string[] }) => (
  <div className="grid grid-cols-5 gap-[calc(1.1*var(--u))]">
    {items.map((id, i) => (
      <Div
        key={id}
        layoutId={id}
        initial={false}
        animate={{
          backgroundColor: i === 0 ? itemColor.winner : itemColor.rest,
          boxShadow: i === 0 ? itemShadow.winner : itemShadow.rest,
        }}
        className="flex size-[calc(5.9*var(--u))] items-center justify-center rounded-[calc(1.5*var(--u))] text-[calc(2.2*var(--u))] font-semibold text-white"
      >
        {id.split('-')[1]}
      </Div>
    ))}
  </div>
);

/** Step 2: the remaining items regroup while the winner flies into its slot. */
export const crown = ({
  remaining,
  winner,
}: {
  remaining: string[];
  winner: string;
}) => (
  <div className="flex w-full max-w-[calc(61.8*var(--u))] items-center justify-between gap-[calc(3.7*var(--u))] px-[calc(3.7*var(--u))]">
    <div className="grid grid-cols-3 gap-[calc(1.1*var(--u))]">
      {remaining.map((id) => (
        <Div
          key={id}
          layoutId={id}
          initial={false}
          animate={{
            backgroundColor: itemColor.rest,
            boxShadow: itemShadow.rest,
          }}
          className="flex size-[calc(5.9*var(--u))] items-center justify-center rounded-[calc(1.5*var(--u))] text-[calc(2.2*var(--u))] font-semibold text-white"
        >
          {id.split('-')[1]}
        </Div>
      ))}
    </div>
    <div className="flex flex-col items-center gap-[calc(1.1*var(--u))]">
      <span className="text-[calc(1.1*var(--u))] font-medium tracking-widest text-muted-foreground uppercase">
        Winner
      </span>
      <div className="flex size-[calc(10.3*var(--u))] items-center justify-center rounded-[calc(2.2*var(--u))] border-2 border-dashed border-amber-400/50 bg-amber-400/5">
        <Div
          layoutId={winner}
          initial={false}
          animate={{
            backgroundColor: itemColor.winner,
            boxShadow: itemShadow.winner,
            scale: 1.1,
          }}
          className="flex size-[calc(7.4*var(--u))] items-center justify-center rounded-[calc(1.5*var(--u))] text-[calc(2.2*var(--u))] font-bold text-white"
        >
          {winner.split('-')[1]}
        </Div>
      </div>
    </div>
  </div>
);
