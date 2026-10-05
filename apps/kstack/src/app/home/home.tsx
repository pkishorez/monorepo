import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { ArrowRight } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { keys, useCommand } from '../../commands/index.ts';
import {
  type Money,
  useMoney,
  useOnline,
  useWrites,
} from '../../client/data/index.ts';
import { LedgerMark, useUser } from '../../client/session/index.ts';
import {
  monthName,
  monthOf,
  summarize,
  today,
} from '../../domain/ledger/index.ts';
import {
  Amount,
  CategoryIcon,
  EntryRow,
  useLookup,
  usePlace,
} from '../parts/index.ts';

/**
 * Home: this Month at a glance. Jump goes to Entries; there is nothing to
 * go next or back to, so those arms of the Thumb Lock stay dimmed.
 */
export function Home() {
  usePlace('home');
  const money = useMoney();
  const navigate = useNavigate();
  const month = monthOf(today());
  const active = keys.useSurface().surface === 'home';
  useCommand('jump', () => void navigate({ to: '/entries' }), {
    enabled: active,
  });
  useCommand(
    'home.open',
    () => void navigate({ to: '/months/$month', params: { month } }),
  );
  if (money.ready && money.accounts.length === 0) return <Welcome />;
  return <Glance money={money} month={month} />;
}

function Glance(props: { readonly money: Money; readonly month: string }) {
  const { money, month } = props;
  const lookup = useLookup(money);
  const navigate = useNavigate();
  const currency = money.preferences.currency;
  const summary = summarize(month, money.entries, money.categories);
  const left = summary.in - summary.out;
  const budgets = money.categories
    .filter((category) => category.budget > 0)
    .map((category) => ({
      category,
      spent:
        summary.spent.find((spend) => spend.category.id === category.id)
          ?.cents ?? 0,
    }))
    .sort((a, b) => b.spent / b.category.budget - a.spent / a.category.budget);
  const recent = money.entries.slice(0, 6);
  const most = Math.max(summary.in, summary.out, 1);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 pb-28 @md:px-8 @md:py-10">
      <section className="space-y-5">
        <p className="text-sm text-muted-foreground">{monthName(month)}</p>
        <div className="space-y-1">
          <h1 className="text-sm font-medium text-muted-foreground">
            Left this month
          </h1>
          <Amount
            cents={left}
            currency={currency}
            className={cn(
              'block text-4xl font-semibold tracking-tight @md:text-5xl',
              left < 0 && 'text-destructive',
            )}
          />
        </div>
        <div className="grid gap-2.5">
          <Bar
            label="In"
            cents={summary.in}
            of={most}
            currency={currency}
            className="bg-muted-foreground/50"
          />
          <Bar
            label="Out"
            cents={summary.out}
            of={most}
            currency={currency}
            className="bg-foreground"
          />
        </div>
      </section>

      {budgets.length > 0 && (
        <section className="space-y-3">
          <Heading to="/months/$month" params={{ month }}>
            Budgets
          </Heading>
          <ul className="grid gap-2 @xl:grid-cols-2">
            {budgets.map(({ category, spent }) => {
              const share = spent / category.budget;
              return (
                <li
                  key={category.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <CategoryIcon icon={category.icon} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {category.name}
                      </span>
                      <span
                        className={cn(
                          'tabular-nums text-xs',
                          share > 1
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        <Amount cents={spent} currency={currency} compact /> of{' '}
                        <Amount
                          cents={category.budget}
                          currency={currency}
                          compact
                        />
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-500',
                          share > 1 ? 'bg-destructive' : 'bg-foreground/70',
                        )}
                        style={{ width: `${Math.min(100, share * 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <Heading to="/entries">Latest</Heading>
        <div className="-mx-3">
          {recent.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              category={lookup.category.get(entry.categoryId)}
              account={lookup.account.get(entry.accountId)}
              currency={currency}
              onClick={() =>
                void navigate({
                  to: '/entries/$entryId',
                  params: { entryId: entry.id },
                })
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Heading(props: {
  readonly to: '/entries' | '/months/$month';
  readonly params?: { readonly month: string };
  readonly children: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-medium">{props.children}</h2>
      <Link
        to={props.to}
        params={props.params as never}
        className="focus-ring -mx-1 flex items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
      >
        See all <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function Bar(props: {
  readonly label: string;
  readonly cents: number;
  readonly of: number;
  readonly currency: string;
  readonly className: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-8 text-muted-foreground">{props.label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            props.className,
          )}
          style={{ width: `${(props.cents / props.of) * 100}%` }}
        />
      </div>
      <Amount
        cents={props.cents}
        currency={props.currency}
        className="w-24 text-right"
      />
    </div>
  );
}

// A new user: start from the sample, or from empty Accounts and Categories.
function Welcome() {
  const user = useUser();
  const { sample } = useWrites();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const start = async (entries: boolean) => {
    setBusy(true);
    try {
      await sample(entries);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center gap-8 px-6 py-10">
      <LedgerMark className="size-12" />
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {user.name.split(' ')[0]}
        </h1>
        <p className="text-pretty text-muted-foreground">
          Ledger keeps your money in accounts, sorted by what it was for. Start
          with three months of sample money to try every key and gesture, or
          start with empty accounts.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          className="h-11"
          disabled={busy || !online}
          onClick={() => void start(true)}
        >
          Start with sample money
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11"
          disabled={busy || !online}
          onClick={() => void start(false)}
        >
          Start empty
        </Button>
      </div>
    </div>
  );
}
