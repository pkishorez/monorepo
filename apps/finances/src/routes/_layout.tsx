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
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@monorepo/frontend/components/ui/sheet';
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import type { DateRange } from '@monorepo/frontend/components/ui/calendar';
import { transactionsCollection } from '@/routes/internal/collections';
import { useDateRange } from '@/routes/internal/stores';

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
  const [calendarMonth, setCalendarMonth] = useState<Date | undefined>(
    undefined,
  );

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

  const displayMonth = useMemo(() => {
    if (calendarMonth) return calendarMonth;
    const base = dateRange?.from ?? maxDate;
    if (!base) return undefined;
    return new Date(base.getFullYear(), base.getMonth() - 1, 1);
  }, [calendarMonth, dateRange?.from, maxDate]);

  const handlePreset = useCallback(
    (preset: Preset) => {
      if (!minDate || !maxDate) return;
      const range = preset.getRange(minDate, maxDate);
      setDateRange(range);
      if (range.from) {
        setCalendarMonth(
          new Date(range.from.getFullYear(), range.from.getMonth(), 1),
        );
      }
      setOpen(false);
    },
    [minDate, maxDate, setDateRange],
  );

  const handleJump = useCallback(
    (direction: -1 | 1) => {
      setCalendarMonth((prev) => {
        const base = prev ?? displayMonth ?? now;
        return new Date(base.getFullYear(), base.getMonth() + direction * 6, 1);
      });
    },
    [displayMonth, now],
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
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setCalendarMonth(undefined);
        }}
      >
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
        <PopoverContent
          className="w-auto max-w-[calc(100vw-2rem)] overflow-auto p-0"
          align="end"
        >
          <div className="flex max-sm:flex-col">
            <div className="flex flex-col gap-0.5 border-r p-3 max-sm:flex-row max-sm:flex-wrap max-sm:border-r-0 max-sm:border-b">
              <span className="mb-1 px-2 text-xs font-medium text-muted-foreground max-sm:w-full">
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
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => handleJump(-1)}
                >
                  <ChevronLeft className="size-3" />6 months
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => handleJump(1)}
                >
                  6 months
                  <ChevronRight className="size-3" />
                </Button>
              </div>
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(range) => setDateRange(range ?? undefined)}
                month={displayMonth}
                onMonthChange={setCalendarMonth}
                numberOfMonths={
                  typeof window !== 'undefined' && window.innerWidth < 640
                    ? 1
                    : 2
                }
                disabled={[
                  ...(minDate ? [{ before: minDate }] : []),
                  ...(maxDate ? [{ after: maxDate }] : []),
                ]}
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

const NAV_LINK_CLASS =
  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground';

function LayoutComponent() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <h1 className="text-lg font-semibold">Finances</h1>
        <nav className="hidden gap-1 sm:flex">
          <Link to="/triage" className={NAV_LINK_CLASS}>
            Triage
          </Link>
          <Link to="/dashboard" className={NAV_LINK_CLASS}>
            Dashboard
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <DateRangePicker />
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <Link
            to="/settings"
            className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:block [&.active]:text-foreground"
          >
            <Settings className="size-4" />
          </Link>
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0 sm:hidden"
                />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="right" className="w-56">
              <nav className="flex flex-col gap-1 pt-4">
                <Link
                  to="/triage"
                  className={NAV_LINK_CLASS}
                  onClick={() => setMobileNavOpen(false)}
                >
                  Triage
                </Link>
                <Link
                  to="/dashboard"
                  className={NAV_LINK_CLASS}
                  onClick={() => setMobileNavOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  to="/settings"
                  className={NAV_LINK_CLASS}
                  onClick={() => setMobileNavOpen(false)}
                >
                  Settings
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main className="flex-1 overflow-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createFileRoute('/_layout')({
  component: LayoutComponent,
});
