import { Button } from '@kstackz/web-platform/components/button';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { keys, useCommand, usePlace } from '@ledger/core/app/commands';
import { monthView } from '@ledger/core/app/places';
import { useMoney } from '@ledger/core/app/session';
import { monthName } from '@ledger/core/model';
import { Amount, CategoryIcon } from '../../parts/index.ts';

/**
 * One Month: what came in, what went out, each day's spending, and where
 * it went by Category against its Budget. Next and Previous turn the Month,
 * never past this one or before the first; Jump goes to the Months.
 */
export function Month(props: { readonly month: string }) {
  usePlace('months.month');
  const { month } = props;
  const money = useMoney();
  const navigate = useNavigate();
  const currency = money.currency;
  const { summary, left, later, earlier, hasLater, hasEarlier, days, peak } =
    monthView(money, month);
  const turn = (to: string) =>
    void navigate({
      to: '/months/$month',
      params: { month: to },
      replace: true,
    });
  const back = () => void navigate({ to: '/months', search: { at: month } });

  const active = keys.useSurface().surface === 'months.month';
  useCommand('next', () => turn(later), { enabled: active && hasLater });
  useCommand('previous', () => turn(earlier), {
    enabled: active && hasEarlier,
  });
  useCommand('jump', back, { enabled: active });
  useCommand('months.month.back', back);
  useCommand(
    'months.month.open',
    () => void navigate({ to: '/entries', search: { month } }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 pb-28 @md:px-8 @md:py-10">
      <div className="flex items-center gap-1">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">
          {monthName(month)}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Earlier month"
          disabled={!hasEarlier}
          onClick={() => turn(earlier)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Later month"
          disabled={!hasLater}
          onClick={() => turn(later)}
        >
          <ChevronRight />
        </Button>
      </div>

      <section className="grid grid-cols-3 gap-2 @md:gap-3">
        <Stat label="In" cents={summary.in} currency={currency} />
        <Stat label="Out" cents={summary.out} currency={currency} />
        <Stat
          label="Left"
          cents={left}
          currency={currency}
          className={left < 0 ? 'text-destructive' : undefined}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Each day</h2>
        <div
          className="flex h-28 items-end gap-[3px]"
          aria-label="Money out each day"
        >
          {days.map((cents, i) => (
            <div
              key={i}
              title={`Day ${i + 1}`}
              className={cn(
                'flex-1 rounded-t-sm',
                cents > 0 ? 'bg-foreground/60' : 'bg-muted',
              )}
              style={{ height: `${Math.max(3, (cents / peak) * 100)}%` }}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Where it went</h2>
          <Link
            to="/entries"
            search={{ month }}
            className="focus-ring -mx-1 flex items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Its entries <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {summary.spent.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing went out this month.
          </p>
        )}
        <ul className="space-y-1">
          {summary.spent.map(({ category, cents }) => {
            const budget = category.budget;
            const of = Math.max(cents, budget, 1);
            return (
              <li key={category.id}>
                <Link
                  to="/entries"
                  search={{ month, category: category.id }}
                  className="focus-ring flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-accent/60"
                >
                  <CategoryIcon icon={category.icon} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>{category.name}</span>
                      <span className="text-muted-foreground">
                        <Amount
                          cents={cents}
                          currency={currency}
                          className="text-foreground"
                        />
                        {budget > 0 && (
                          <>
                            {' '}
                            of{' '}
                            <Amount
                              cents={budget}
                              currency={currency}
                              compact
                            />
                          </>
                        )}
                      </span>
                    </div>
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          cents > budget && budget > 0
                            ? 'bg-destructive'
                            : 'bg-foreground/70',
                        )}
                        style={{ width: `${(cents / of) * 100}%` }}
                      />
                      {budget > 0 && (
                        <div
                          className="absolute inset-y-0 w-0.5 bg-foreground/60"
                          style={{ left: `${(budget / of) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat(props: {
  readonly label: string;
  readonly cents: number;
  readonly currency: string;
  readonly className?: string | undefined;
}) {
  return (
    <div className="space-y-1 rounded-lg border p-3 @md:p-4">
      <p className="text-xs text-muted-foreground">{props.label}</p>
      <Amount
        cents={props.cents}
        currency={props.currency}
        compact
        className={cn('text-base font-semibold @md:text-xl', props.className)}
      />
    </div>
  );
}
