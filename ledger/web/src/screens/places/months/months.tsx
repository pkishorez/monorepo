import { CalendarRange } from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { keys, useCommand, usePlace } from '@ledger/core/commands';
import { monthsView } from '@ledger/core/places';
import { useMoney } from '@ledger/core/session';
import { monthName } from '@ledger/core/model';
import { Amount, scrollMarked } from '../../parts/index.ts';

/**
 * The Months: each with what came in and went out. Next and Previous move
 * the mark; Enter opens the marked Month. It is The List of a Month.
 */
export function Months(props: { readonly at: string | undefined }) {
  usePlace('months');
  const money = useMoney();
  const navigate = useNavigate();
  const { surface } = keys.useSurface();
  const { months, most } = monthsView(money);
  const [marked, setMarked] = useState(props.at ?? months[0]?.month);
  const list = useRef<HTMLUListElement>(null);
  const currency = money.currency;
  useEffect(() => {
    if (marked === undefined && months[0]) setMarked(months[0].month);
  }, [marked, months]);
  useEffect(() => {
    if (list.current) scrollMarked(list.current);
  }, [marked]);

  const at = months.findIndex((month) => month.month === marked);
  const active = surface === 'months';
  const open = (month: string) =>
    void navigate({ to: '/months/$month', params: { month } });
  useCommand('next', () => setMarked(months[at + 1]?.month), {
    enabled: active && at < months.length - 1,
  });
  useCommand('previous', () => setMarked(months[at - 1]?.month), {
    enabled: active && at > 0,
  });
  useCommand('months.open', () => marked && open(marked), {
    enabled: active && marked !== undefined,
  });

  if (money.ready && months.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center text-muted-foreground">
        <CalendarRange className="size-8" aria-hidden="true" />
        <p className="text-sm">Months show up once there are entries.</p>
      </div>
    );
  }
  return (
    <ul
      ref={list}
      className="mx-auto max-w-2xl space-y-2 px-4 py-6 pb-28 @md:px-8 @md:py-10"
    >
      {months.map((month) => {
        const left = month.in - month.out;
        return (
          <li key={month.month}>
            <button
              type="button"
              data-marked={month.month === marked ? '' : undefined}
              onClick={() => {
                setMarked(month.month);
                open(month.month);
              }}
              className={cn(
                'focus-ring w-full scroll-my-24 space-y-3 rounded-lg border p-4 text-left transition-colors duration-100 hover:bg-accent/50',
                month.month === marked && 'bg-accent',
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">
                  {monthName(month.month)}
                </span>
                <span className="text-sm text-muted-foreground">
                  Left{' '}
                  <Amount
                    cents={left}
                    currency={currency}
                    className={cn(
                      'font-medium text-foreground',
                      left < 0 && 'text-destructive',
                    )}
                  />
                </span>
              </div>
              <div className="grid gap-1.5">
                <Line
                  cents={month.in}
                  of={most}
                  className="bg-muted-foreground/50"
                  currency={currency}
                />
                <Line
                  cents={month.out}
                  of={most}
                  className="bg-foreground/70"
                  currency={currency}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Line(props: {
  readonly cents: number;
  readonly of: number;
  readonly className: string;
  readonly currency: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', props.className)}
          style={{ width: `${(props.cents / props.of) * 100}%` }}
        />
      </div>
      <Amount
        cents={props.cents}
        currency={props.currency}
        compact
        className="w-16 text-right text-xs text-muted-foreground"
      />
    </div>
  );
}
