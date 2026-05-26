import { useCallback, useMemo, useRef, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { Badge } from '@monorepo/frontend/components/ui/badge';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@monorepo/frontend/components/ui/card';
import { Checkbox } from '@monorepo/frontend/components/ui/checkbox';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@monorepo/frontend/components/ui/chart';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@monorepo/frontend/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@monorepo/frontend/components/ui/dialog';
import { Label } from '@monorepo/frontend/components/ui/label';
import { Progress } from '@monorepo/frontend/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monorepo/frontend/components/ui/select';
import { Skeleton } from '@monorepo/frontend/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@monorepo/frontend/components/ui/tabs';
import { Textarea } from '@monorepo/frontend/components/ui/textarea';
import {
  UploadCloud,
  TrendingUp,
  TrendingDown,
  Wallet,
  Crown,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  ClipboardCheck,
  Pencil,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ProjectionOutputSchema } from '@/domain';
import { DataTable, type ColumnDef } from '@/routes/components/data-table';
import {
  transactionsCollection,
  replaceTransactions,
  overridesCollection,
  overridesUtils,
  settingsCollection,
} from '@/routes/internal/collections';
import { useDateRange } from '@/routes/internal/date-range-context';
import { FinancesClient, financesRuntime } from '@/routes/internal/effect';
import type { OverrideSchema, SettingsSchema } from '@/domain';
import {
  mergeTransactionsWithOverrides,
  filterForAnalysis,
  extractCategories,
  type MergedTransaction,
} from '@/orchestration';

type Override = typeof OverrideSchema.Type;
type Settings = typeof SettingsSchema.Type;

type TimeRange = 'this-month' | 'last-3' | 'last-6' | 'this-year' | 'all';
type GroupBy = 'category' | 'bank' | 'type';
type Granularity = 'day' | 'month';
type ActiveTab = 'chart' | 'table';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-3', label: 'Last 3 months' },
  { value: 'last-6', label: 'Last 6 months' },
  { value: 'this-year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export const Route = createFileRoute('/_layout/dashboard')({
  component: DashboardPage,
});

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getTimeRangeStart(range: TimeRange, now: Date): Date | null {
  if (range === 'all') return null;
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'this-month') return d;
  if (range === 'last-3') {
    d.setMonth(d.getMonth() - 2);
    return d;
  }
  if (range === 'last-6') {
    d.setMonth(d.getMonth() - 5);
    return d;
  }
  return new Date(now.getFullYear(), 0, 1);
}

function getPreviousPeriodRange(
  range: TimeRange,
  now: Date,
): { start: Date; end: Date } | null {
  if (range === 'all') return null;
  const currentStart = getTimeRangeStart(range, now)!;
  const monthSpan =
    (now.getFullYear() - currentStart.getFullYear()) * 12 +
    now.getMonth() -
    currentStart.getMonth() +
    1;
  const prevEnd = new Date(currentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(currentStart);
  prevStart.setMonth(prevStart.getMonth() - monthSpan);
  return { start: prevStart, end: prevEnd };
}

function resolveType(
  txn: MergedTransaction,
  settingsMap: Map<string, string>,
): 'income' | 'spend' | 'transfer' | 'ignore' {
  const catType = settingsMap.get(txn.category);
  if (catType) return catType as 'income' | 'spend' | 'transfer' | 'ignore';
  if (txn.is_transfer) return 'transfer';
  return txn.type === 'credit' ? 'income' : 'spend';
}

function computeTimeRangeSpanDays(range: TimeRange, now: Date): number {
  const start = getTimeRangeStart(range, now);
  if (!start) return Infinity;
  return Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function saveOverride(overrideValue: {
  transactionId: string;
  category: string;
  subcategory: string;
  notes?: string;
  verified: boolean;
  ignore: boolean;
}) {
  const payload = {
    ...overrideValue,
    cancelled_by: null,
  };
  const now = new Date().toISOString();
  overridesUtils.upsert({
    value: payload,
    meta: { _v: '1', _e: 'Override', _d: false, _u: now },
  });

  financesRuntime
    .runPromise(
      Effect.gen(function* () {
        const { client } = yield* FinancesClient;
        yield* client.saveOverride(payload);
      }),
    )
    .catch(() => {});
}

function DashboardPage() {
  const txnQuery = useLiveQuery(transactionsCollection);
  const ovdQuery = useLiveQuery(overridesCollection);
  const settingsQuery = useLiveQuery(settingsCollection);
  const { dateRange } = useDateRange();

  const loading =
    txnQuery.isLoading || ovdQuery.isLoading || settingsQuery.isLoading;
  const transactions = txnQuery.data ?? [];
  const overrides = (ovdQuery.data ?? []) as Override[];
  const settings = (settingsQuery.data ?? { categoryTypes: {} }) as Settings;

  const [timeRange, setTimeRange] = useState<TimeRange>('this-month');
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [granularityOverride, setGranularityOverride] =
    useState<Granularity | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('chart');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [tableSort, setTableSort] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [tablePage, setTablePage] = useState(0);
  const [tablePageSize, setTablePageSize] = useState(25);
  const [editingTxn, setEditingTxn] = useState<
    (MergedTransaction & { resolvedType: string }) | null
  >(null);

  const settingsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const [category, type] of Object.entries(settings.categoryTypes)) {
      m.set(category, type);
    }
    return m;
  }, [settings.categoryTypes]);

  const merged = useMemo(
    () => mergeTransactionsWithOverrides(transactions, overrides),
    [transactions, overrides],
  );

  const dateFilteredMerged = useMemo(() => {
    if (!dateRange?.from) return merged;
    const fromStr = dateRange.from.toISOString().slice(0, 10);
    const toStr = dateRange.to
      ? dateRange.to.toISOString().slice(0, 10)
      : fromStr;
    return merged.filter((t) => t.date >= fromStr && t.date <= toStr);
  }, [merged, dateRange]);

  const allAnalysisData = useMemo(
    () => filterForAnalysis(dateFilteredMerged),
    [dateFilteredMerged],
  );

  const analysisData = useMemo(
    () => allAnalysisData.filter((txn) => txn.verified === true),
    [allAnalysisData],
  );

  const verifiedCount = analysisData.length;
  const totalCount = allAnalysisData.length;
  const triagePercent =
    totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

  const now = useMemo(() => new Date(), []);

  const filteredData = useMemo(() => {
    const start = getTimeRangeStart(timeRange, now);
    if (!start) return analysisData;
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    return analysisData.filter((txn) => txn.date.slice(0, 7) >= startStr);
  }, [analysisData, timeRange, now]);

  const typedData = useMemo(() => {
    return filteredData.map((txn) => ({
      ...txn,
      resolvedType: resolveType(txn, settingsMap),
    }));
  }, [filteredData, settingsMap]);

  const incomeTransactions = useMemo(
    () => typedData.filter((t) => t.resolvedType === 'income'),
    [typedData],
  );

  const spendTransactions = useMemo(
    () => typedData.filter((t) => t.resolvedType === 'spend'),
    [typedData],
  );

  const totalIncome = useMemo(
    () => incomeTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    [incomeTransactions],
  );

  const totalSpend = useMemo(
    () => spendTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    [spendTransactions],
  );

  const netSavings = totalIncome - totalSpend;

  const topCategory = useMemo(() => {
    const cats = new Map<string, number>();
    for (const t of spendTransactions) {
      const cat = t.category || 'Uncategorized';
      cats.set(cat, (cats.get(cat) ?? 0) + Math.abs(t.amount));
    }
    let max = { name: '-', amount: 0 };
    for (const [name, amount] of cats) {
      if (amount > max.amount) max = { name, amount };
    }
    return max;
  }, [spendTransactions]);

  const prevPeriodChange = useMemo(() => {
    const prev = getPreviousPeriodRange(timeRange, now);
    if (!prev) return null;

    const prevStartStr = `${prev.start.getFullYear()}-${String(prev.start.getMonth() + 1).padStart(2, '0')}`;
    const prevEndStr = `${prev.end.getFullYear()}-${String(prev.end.getMonth() + 1).padStart(2, '0')}`;

    const prevData = analysisData
      .filter((txn) => {
        const m = txn.date.slice(0, 7);
        return m >= prevStartStr && m <= prevEndStr;
      })
      .map((txn) => ({ ...txn, resolvedType: resolveType(txn, settingsMap) }));

    const prevIncome = prevData
      .filter((t) => t.resolvedType === 'income')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const prevSpend = prevData
      .filter((t) => t.resolvedType === 'spend')
      .reduce((s, t) => s + Math.abs(t.amount), 0);

    return {
      income:
        prevIncome > 0 ? ((totalIncome - prevIncome) / prevIncome) * 100 : null,
      spend:
        prevSpend > 0 ? ((totalSpend - prevSpend) / prevSpend) * 100 : null,
      savings: prevIncome - prevSpend,
    };
  }, [timeRange, now, analysisData, settingsMap, totalIncome, totalSpend]);

  const autoGranularity: Granularity = useMemo(() => {
    const spanDays = computeTimeRangeSpanDays(timeRange, now);
    return spanDays <= 31 ? 'day' : 'month';
  }, [timeRange, now]);

  const effectiveGranularity = granularityOverride ?? autoGranularity;

  const { chartData, chartConfig, segmentKeys } = useMemo(() => {
    const periodMap = new Map<string, Map<string, number>>();
    const segmentTotals = new Map<string, number>();

    const allTyped = [...incomeTransactions, ...spendTransactions];

    for (const t of allTyped) {
      const period =
        effectiveGranularity === 'day'
          ? t.date.slice(0, 10)
          : t.date.slice(0, 7);
      let segment: string;
      if (groupBy === 'type') {
        segment = resolveType(t, settingsMap);
      } else {
        segment =
          groupBy === 'category'
            ? t.category || 'Uncategorized'
            : t.bank || 'Unknown';
      }
      const isIncome = resolveType(t, settingsMap) === 'income';
      const value = isIncome ? Math.abs(t.amount) : -Math.abs(t.amount);

      if (!periodMap.has(period)) periodMap.set(period, new Map());
      const m = periodMap.get(period)!;
      m.set(segment, (m.get(segment) ?? 0) + value);
      segmentTotals.set(
        segment,
        (segmentTotals.get(segment) ?? 0) + Math.abs(t.amount),
      );
    }

    const sorted = [...segmentTotals.entries()].sort((a, b) => b[1] - a[1]);
    const top8 = sorted.slice(0, 8).map(([k]) => k);
    const hasOther = sorted.length > 8;
    const top8Set = new Set(top8);
    const keys = hasOther ? [...top8, 'Other'] : top8;

    const config: ChartConfig = {};
    keys.forEach((key, i) => {
      config[key] = {
        label: key,
        color: `var(--chart-${(i % 9) + 1})`,
      };
    });

    const data = [...periodMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, segments]) => {
        const row: Record<string, string | number> = { period };
        for (const key of top8) {
          row[key] = segments.get(key) ?? 0;
        }
        if (hasOther) {
          let otherSum = 0;
          for (const [seg, val] of segments) {
            if (!top8Set.has(seg)) otherSum += val;
          }
          row['Other'] = otherSum;
        }
        return row;
      });

    return { chartData: data, chartConfig: config, segmentKeys: keys };
  }, [
    incomeTransactions,
    spendTransactions,
    groupBy,
    settingsMap,
    effectiveGranularity,
  ]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const t of typedData) set.add(t.date.slice(0, 7));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [typedData]);

  const effectiveMonth = selectedMonth ?? months[0] ?? null;

  const allCategories = useMemo(
    () => extractCategories(dateFilteredMerged),
    [dateFilteredMerged],
  );

  const allSubcategories = useMemo(() => {
    const subs = new Set<string>();
    for (const t of dateFilteredMerged) {
      if (t.subcategory) subs.add(t.subcategory);
    }
    return [...subs].sort((a, b) => a.localeCompare(b));
  }, [dateFilteredMerged]);

  const tableData = useMemo(() => {
    if (!effectiveMonth) return [];
    let data = typedData.filter((t) => t.date.slice(0, 7) === effectiveMonth);
    if (tableSort) {
      data = [...data].sort((a, b) => {
        const dir = tableSort.direction === 'asc' ? 1 : -1;
        if (tableSort.key === 'date') return dir * a.date.localeCompare(b.date);
        if (tableSort.key === 'amount')
          return dir * (Math.abs(a.amount) - Math.abs(b.amount));
        if (tableSort.key === 'description')
          return dir * a.description.localeCompare(b.description);
        if (tableSort.key === 'bank')
          return dir * (a.bank ?? '').localeCompare(b.bank ?? '');
        if (tableSort.key === 'category')
          return dir * (a.category ?? '').localeCompare(b.category ?? '');
        return 0;
      });
    }
    return data;
  }, [typedData, effectiveMonth, tableSort]);

  const tableColumns: ColumnDef<
    MergedTransaction & { resolvedType: string }
  >[] = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date',
        sortable: true,
        render: (row) => row.date,
      },
      {
        key: 'description',
        header: 'Description',
        sortable: true,
        render: (row) => (
          <span className="max-w-[200px] truncate block">
            {row.description}
          </span>
        ),
      },
      {
        key: 'amount',
        header: 'Amount',
        sortable: true,
        render: (row) => (
          <span
            className={`font-mono tabular-nums ${
              row.type === 'credit' ? 'text-positive' : 'text-destructive'
            }`}
          >
            {formatCurrency(Math.abs(row.amount))}
          </span>
        ),
      },
      {
        key: 'bank',
        header: 'Bank',
        sortable: true,
        render: (row) => row.bank ?? '-',
      },
      {
        key: 'category',
        header: 'Category',
        sortable: true,
        render: (row) => row.category ?? '-',
      },
      {
        key: 'type',
        header: 'Type',
        sortable: false,
        render: (row) => (
          <Badge
            variant={row.resolvedType === 'income' ? 'default' : 'secondary'}
          >
            {row.resolvedType}
          </Badge>
        ),
      },
      {
        key: 'edit',
        header: '',
        sortable: false,
        render: (row) => (
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setEditingTxn(row);
            }}
          >
            <Pencil className="size-4" />
          </button>
        ),
      },
    ],
    [],
  );

  const handleBarClick = useCallback((data: Record<string, unknown>) => {
    if (data && typeof data.period === 'string') {
      const month = data.period.slice(0, 7);
      setSelectedMonth(month);
      setActiveTab('table');
      setTablePage(0);
    }
  }, []);

  const handleTabChange = useCallback((value: string | number | null) => {
    if (value === 'chart' || value === 'table') {
      setActiveTab(value as ActiveTab);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Card key={i} className="min-h-[140px] rounded-sm">
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
                <Skeleton className="mt-2 h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return <EmptyState />;
  }

  if (verifiedCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <AlertCircle className="size-12 text-muted-foreground" />
        <div className="flex flex-col items-center gap-1">
          <h3 className="text-lg font-medium">No verified transactions yet</h3>
          <p className="text-sm text-muted-foreground">
            Head to Triage to verify your data.
          </p>
        </div>
        <Button render={<Link to="/triage" />}>Go to Triage</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-xs text-muted-foreground">
            Showing {verifiedCount.toLocaleString()} of{' '}
            {totalCount.toLocaleString()} verified transactions
          </p>
        </div>
        <Select
          value={timeRange}
          onValueChange={(val) => {
            setTimeRange(val as TimeRange);
            setTablePage(0);
            setGranularityOverride(null);
          }}
        >
          <SelectTrigger className="w-full min-h-9 sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Total Income"
          icon={<TrendingUp className="size-4 text-positive" />}
          value={formatCurrency(totalIncome)}
          change={prevPeriodChange?.income ?? null}
          valueClass="text-positive"
        />
        <KpiCard
          title="Total Spend"
          icon={<TrendingDown className="size-4 text-destructive" />}
          value={formatCurrency(totalSpend)}
          change={prevPeriodChange?.spend ?? null}
          invertChange
          valueClass="text-destructive"
        />
        <KpiCard
          title="Net Savings"
          icon={<Wallet className="size-4 text-primary" />}
          value={formatCurrency(netSavings)}
          change={
            prevPeriodChange?.savings != null
              ? prevPeriodChange.savings !== 0
                ? ((netSavings - prevPeriodChange.savings) /
                    Math.abs(prevPeriodChange.savings)) *
                  100
                : null
              : null
          }
          valueClass={netSavings >= 0 ? 'text-positive' : 'text-destructive'}
        />
        <KpiCard
          title="Top Category"
          icon={<Crown className="size-4 text-primary" />}
          value={topCategory.name}
          subtitle={formatCurrency(topCategory.amount)}
          change={null}
          valueClass="text-primary"
        />
        <Link to="/triage" className="contents">
          <Card className="min-h-[140px] rounded-sm hover:shadow-md transition-shadow hover:border-foreground/20 cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Triage Progress
                </CardTitle>
                <ClipboardCheck className="size-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums tracking-tight text-primary">
                {triagePercent}% verified
              </div>
              <div className="mt-1.5 text-sm text-muted-foreground">
                {verifiedCount} / {totalCount} transactions
              </div>
              <div className="mt-2">
                <Progress value={triagePercent} />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <TabsList>
                <TabsTrigger value="chart" className="min-h-9 min-w-[72px]">
                  Chart
                </TabsTrigger>
                <TabsTrigger value="table" className="min-h-9 min-w-[72px]">
                  Table
                </TabsTrigger>
              </TabsList>
              {activeTab === 'chart' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={granularityOverride ?? autoGranularity}
                    onValueChange={(val) =>
                      setGranularityOverride(
                        val === autoGranularity ? null : (val as Granularity),
                      )
                    }
                  >
                    <SelectTrigger className="w-full min-h-9 sm:w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">By Day</SelectItem>
                      <SelectItem value="month">By Month</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={groupBy}
                    onValueChange={(val) => setGroupBy(val as GroupBy)}
                  >
                    <SelectTrigger className="w-full min-h-9 sm:w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="category">By Category</SelectItem>
                      <SelectItem value="bank">By Bank</SelectItem>
                      <SelectItem value="type">By Type</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {activeTab === 'table' && (
                <Select
                  value={effectiveMonth ?? ''}
                  onValueChange={(val) => {
                    setSelectedMonth(val as string);
                    setTablePage(0);
                  }}
                >
                  <SelectTrigger className="w-full min-h-9 sm:w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <TabsContent value="chart" className="mt-0">
              {chartData.length > 0 ? (
                <ChartContainer
                  config={chartConfig}
                  className="min-h-[400px] w-full"
                >
                  <BarChart
                    data={chartData}
                    stackOffset="sign"
                    margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    onClick={(e: Record<string, unknown>) => {
                      const ap = e?.activePayload;
                      if (Array.isArray(ap) && ap[0]?.payload) {
                        handleBarClick(
                          ap[0].payload as Record<string, unknown>,
                        );
                      }
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-border/40"
                    />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        new Intl.NumberFormat('en-IN', {
                          notation: 'compact',
                          compactDisplay: 'short',
                        }).format(v)
                      }
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, _name, item) => {
                            const numValue =
                              typeof value === 'number' ? value : Number(value);
                            const payload = item?.payload as
                              | Record<string, number>
                              | undefined;
                            const periodTotal = payload
                              ? segmentKeys.reduce(
                                  (s, k) => s + Math.abs(payload[k] ?? 0),
                                  0,
                                )
                              : 0;
                            const pct =
                              periodTotal > 0
                                ? (
                                    (Math.abs(numValue) / periodTotal) *
                                    100
                                  ).toFixed(1)
                                : '0';
                            return (
                              <span>
                                {formatCurrency(Math.abs(numValue))} ({pct}%)
                              </span>
                            );
                          }}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    {segmentKeys.map((key) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="stack"
                        fill={`var(--color-${key})`}
                        className="cursor-pointer"
                        radius={[2, 2, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
                  No data for selected time range.
                </div>
              )}
            </TabsContent>

            <TabsContent value="table" className="mt-0">
              <DataTable
                data={tableData}
                columns={tableColumns}
                sort={tableSort}
                setSort={setTableSort}
                page={tablePage}
                setPage={setTablePage}
                pageSize={tablePageSize}
                setPageSize={setTablePageSize}
                expandedId={null}
                setExpandedId={() => {}}
                getRowId={(row) => row.id}
                emptyState="No transactions for this month."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {editingTxn && (
        <EditDialog
          txn={editingTxn}
          categories={allCategories}
          subcategories={allSubcategories}
          onClose={() => setEditingTxn(null)}
        />
      )}
    </div>
  );
}

function KpiCard({
  title,
  icon,
  value,
  subtitle,
  change,
  invertChange,
  valueClass,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  subtitle?: string;
  change: number | null;
  invertChange?: boolean;
  valueClass?: string;
}) {
  const isPositive =
    change != null && (invertChange ? change <= 0 : change >= 0);

  return (
    <Card className="min-h-[140px] rounded-sm hover:shadow-md transition-shadow hover:border-foreground/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </CardTitle>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold tabular-nums tracking-tight ${valueClass ?? ''}`}
        >
          {value}
        </div>
        {subtitle && (
          <div className="mt-1.5 text-sm text-muted-foreground">{subtitle}</div>
        )}
        {change != null && (
          <div className="mt-2">
            <Badge
              variant="outline"
              className={`gap-1 text-[11px] font-medium ${
                isPositive
                  ? 'border-positive text-positive'
                  : 'border-destructive text-destructive'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {change >= 0 ? '+' : ''}
              {change.toFixed(1)}%
            </Badge>
            <span className="ml-1.5 text-[11px] text-muted-foreground">
              vs previous period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditDialog({
  txn,
  categories,
  subcategories,
  onClose,
}: {
  txn: MergedTransaction & { resolvedType: string };
  categories: string[];
  subcategories: string[];
  onClose: () => void;
}) {
  const [category, setCategory] = useState(txn.category ?? '');
  const [subcategory, setSubcategory] = useState(txn.subcategory ?? '');
  const [notes, setNotes] = useState(txn.notes ?? '');
  const [verified, setVerified] = useState(txn.verified ?? false);
  const [ignore, setIgnore] = useState(txn.ignore ?? false);

  const handleSave = useCallback(() => {
    saveOverride({
      transactionId: txn.id,
      category,
      subcategory,
      notes: notes || undefined,
      verified,
      ignore,
    });
    onClose();
  }, [txn.id, category, subcategory, notes, verified, ignore, onClose]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>
            {txn.description} — {formatCurrency(Math.abs(txn.amount))}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-category">Category</Label>
            <Combobox
              value={category}
              onValueChange={(val) => setCategory(val ?? '')}
            >
              <ComboboxInput placeholder="Select category..." />
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxEmpty>No categories found.</ComboboxEmpty>
                  {categories.map((cat) => (
                    <ComboboxItem key={cat} value={cat}>
                      {cat}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-subcategory">Subcategory</Label>
            <Combobox
              value={subcategory}
              onValueChange={(val) => setSubcategory(val ?? '')}
            >
              <ComboboxInput placeholder="Select subcategory..." />
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxEmpty>No subcategories found.</ComboboxEmpty>
                  {subcategories.map((sub) => (
                    <ComboboxItem key={sub} value={sub}>
                      {sub}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-verified"
                checked={verified}
                onCheckedChange={(val) => setVerified(val as boolean)}
              />
              <Label htmlFor="edit-verified">Verified</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-ignore"
                checked={ignore}
                onCheckedChange={(val) => setIgnore(val as boolean)}
              />
              <Label htmlFor="edit-ignore">Ignore</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = JSON.parse(e.target?.result as string);
          const decoded = Schema.decodeUnknownSync(ProjectionOutputSchema)(raw);
          void replaceTransactions(decoded)
            .then(() => setError(null))
            .catch((uploadErr) =>
              setError(
                uploadErr instanceof Error
                  ? uploadErr.message
                  : 'Failed to upload transactions',
              ),
            );
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to parse JSON file',
          );
        }
      };
      reader.readAsText(file);

      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
  );

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <UploadCloud className="size-12 text-muted-foreground" />
      <div className="flex flex-col items-center gap-1">
        <h3 className="text-lg font-medium">No transactions yet</h3>
        <p className="text-sm text-muted-foreground">
          Upload your transaction data to get started
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button onClick={() => fileInputRef.current?.click()}>
        Upload Transactions
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
