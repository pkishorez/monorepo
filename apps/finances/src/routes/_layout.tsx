import { useCallback, useMemo, useState } from 'react';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Calendar } from '@monorepo/frontend/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@monorepo/frontend/components/ui/popover';
import { Separator } from '@monorepo/frontend/components/ui/separator';
import { CalendarIcon, Settings, X } from 'lucide-react';
import type { DateRange } from '@monorepo/frontend/components/ui/calendar';
import { transactionsCollection } from '@/routes/internal/collections';
import {
  DateRangeProvider,
  useDateRange,
} from '@/routes/internal/date-range-context';

type Preset = { label: string; getRange: (min: Date, max: Date) => DateRange };

function getPresets(now: Date): Preset[] {
  return [
    {
      label: 'This Year',
      getRange: () => ({
        from: new Date(now.getFullYear(), 0, 1),
        to: now,
      }),
    },
    {
      label: 'Last Year',
      getRange: () => ({
        from: new Date(now.getFullYear() - 1, 0, 1),
        to: new Date(now.getFullYear() - 1, 11, 31),
      }),
    },
    {
      label: 'Last 6 Months',
      getRange: () => {
        const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        return { from, to: now };
      },
    },
    {
      label: 'Last 3 Months',
      getRange: () => {
        const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { from, to: now };
      },
    },
    {
      label: 'This Month',
      getRange: () => ({
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: now,
      }),
    },
    {
      label: 'All Time',
      getRange: (min, max) => ({ from: min, to: max }),
    },
  ];
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function DateRangePicker() {
  const { dateRange, setDateRange } = useDateRange();
  const [open, setOpen] = useState(false);

  const txnQuery = useLiveQuery(transactionsCollection);
  const transactions = txnQuery.data ?? [];

  const { minDate, maxDate } = useMemo(() => {
    if (transactions.length === 0) return { minDate: null, maxDate: null };
    let min = transactions[0]!.date;
    let max = transactions[0]!.date;
    for (const t of transactions) {
      if (t.date < min) min = t.date;
      if (t.date > max) max = t.date;
    }
    return {
      minDate: new Date(min),
      maxDate: new Date(max),
    };
  }, [transactions]);

  const now = useMemo(() => new Date(), []);
  const presets = useMemo(() => getPresets(now), [now]);

  const handlePreset = useCallback(
    (preset: Preset) => {
      if (!minDate || !maxDate) return;
      setDateRange(preset.getRange(minDate, maxDate));
      setOpen(false);
    },
    [minDate, maxDate, setDateRange],
  );

  const handleClear = useCallback(() => {
    setDateRange(undefined);
  }, [setDateRange]);

  if (transactions.length === 0) return null;

  const label = dateRange?.from
    ? dateRange.to
      ? `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`
      : formatDate(dateRange.from)
    : 'All dates';

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs font-normal"
            />
          }
        >
          <CalendarIcon className="size-3.5" />
          <span className="max-w-[200px] truncate">{label}</span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex">
            <div className="flex flex-col gap-1 border-r p-3">
              <span className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                Quick select
              </span>
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="h-7 justify-start px-2 text-xs"
                  onClick={() => handlePreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="p-3">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => setDateRange(range ?? undefined)}
                numberOfMonths={2}
                disabled={[
                  ...(minDate ? [{ before: minDate }] : []),
                  ...(maxDate ? [{ after: maxDate }] : []),
                ]}
                defaultMonth={
                  (dateRange?.from ?? maxDate)
                    ? new Date(
                        (dateRange?.from ?? maxDate!).getFullYear(),
                        (dateRange?.from ?? maxDate!).getMonth() - 1,
                        1,
                      )
                    : undefined
                }
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {dateRange && (
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={handleClear}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function LayoutComponent() {
  return (
    <DateRangeProvider>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-4 border-b px-4 py-2">
          <h1 className="text-lg font-semibold">Finances</h1>
          <nav className="flex gap-1">
            <Link
              to="/triage"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              Triage
            </Link>
            <Link
              to="/dashboard"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
            >
              Dashboard
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <DateRangePicker />
            <Separator orientation="vertical" className="h-5" />
            <Link
              to="/settings"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:text-foreground"
            >
              <Settings className="size-4" />
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </DateRangeProvider>
  );
}

export const Route = createFileRoute('/_layout')({
  component: LayoutComponent,
});
