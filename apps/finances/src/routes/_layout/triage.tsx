import { Fragment, memo, useCallback, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { Badge } from '@monorepo/frontend/components/ui/badge';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Checkbox } from '@monorepo/frontend/components/ui/checkbox';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@monorepo/frontend/components/ui/dialog';
import { Input } from '@monorepo/frontend/components/ui/input';
import { Progress } from '@monorepo/frontend/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monorepo/frontend/components/ui/select';
import { Separator } from '@monorepo/frontend/components/ui/separator';
import { Textarea } from '@monorepo/frontend/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@monorepo/frontend/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@monorepo/frontend/components/ui/table';
import {
  Check,
  EyeOff,
  RotateCcw,
  StickyNote,
  UploadCloud,
  X,
} from 'lucide-react';
import { ProjectionOutputSchema } from '@/domain';
import { DataTable, type ColumnDef } from '@/routes/components/data-table';
import {
  transactionsCollection,
  replaceTransactions,
  overridesCollection,
  overridesUtils,
} from '@/routes/internal/collections';
import { useDateRange } from '@/routes/internal/date-range-context';
import { FinancesClient, financesRuntime } from '@/routes/internal/effect';
import type { OverrideSchema } from '@/domain';
import {
  computeCoverage,
  mergeTransactionsWithOverrides,
  type MergedTransaction,
} from '@/orchestration';

type Override = typeof OverrideSchema.Type;
type StatusTab = 'all' | 'unverified' | 'verified' | 'ignored' | 'transfers';
type SortKey = 'amount' | 'date';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

interface AmountRange {
  min: string;
  max: string;
}

const STATUS_OPTIONS: { value: StatusTab; label: string }[] = [
  { value: 'transfers', label: 'Transfers' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'verified', label: 'Verified' },
  { value: 'ignored', label: 'Ignored' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'date-desc', label: 'Date newest' },
  { value: 'date-asc', label: 'Date oldest' },
  { value: 'amount-desc', label: 'Amount highest' },
  { value: 'amount-asc', label: 'Amount lowest' },
];

const DEFAULT_SORT: SortConfig = { key: 'amount', direction: 'desc' };
const DEFAULT_PAGE_SIZE = 50;

export const Route = createFileRoute('/_layout/triage')({
  component: TriagePage,
});

function MultiSelectCombobox({
  label,
  selected,
  options,
  labels,
  onToggle,
}: {
  label: string;
  selected: string[];
  options: string[];
  labels?: Record<string, string>;
  onToggle: (value: string) => void;
}) {
  const displayLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (labels?.[selected[0]!] ?? selected[0])
        : `${label} (${selected.length})`;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Combobox
        value={null}
        onValueChange={(val) => {
          if (val) onToggle(val);
        }}
      >
        <ComboboxInput placeholder={displayLabel} className="h-9 w-40" />
        <ComboboxContent>
          <ComboboxList>
            {options.map((opt) => (
              <ComboboxItem key={opt} value={opt}>
                <span className="flex items-center gap-2">
                  <span
                    className={`flex size-4 items-center justify-center rounded-sm border ${
                      selected.includes(opt)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30'
                    }`}
                  >
                    {selected.includes(opt) && <Check className="size-3" />}
                  </span>
                  {labels?.[opt] ?? opt}
                </span>
              </ComboboxItem>
            ))}
          </ComboboxList>
          <ComboboxEmpty>No matches</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
}

function sortMerged(
  items: MergedTransaction[],
  sort: SortConfig,
): MergedTransaction[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (sort.key === 'amount') {
      const diff = Math.abs(b.amount) - Math.abs(a.amount);
      return sort.direction === 'desc' ? diff : -diff;
    }
    const diff = a.date.localeCompare(b.date);
    return sort.direction === 'desc' ? -diff : diff;
  });
  return sorted;
}

function saveOverride(overrideValue: {
  transactionId: string;
  category: string;
  subcategory: string;
  notes?: string;
  verified: boolean;
  ignore: boolean;
  cancelled_by?: string | null;
}) {
  const payload = {
    ...overrideValue,
    cancelled_by: overrideValue.cancelled_by ?? null,
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

function TriagePage() {
  const txnQuery = useLiveQuery(transactionsCollection);
  const ovdQuery = useLiveQuery(overridesCollection);
  const { dateRange } = useDateRange();

  const loading = txnQuery.isLoading || ovdQuery.isLoading;
  const transactions = txnQuery.data ?? [];
  const overrides = (ovdQuery.data ?? []) as Override[];

  const [statusFilters, setStatusFilters] = useState<StatusTab[]>([
    'transfers',
  ]);
  const [bankFilters, setBankFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [amountRange, setAmountRange] = useState<AmountRange>({
    min: '',
    max: '',
  });
  const [sort, setSort] = useState<SortConfig>(DEFAULT_SORT);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const allMerged = useMemo(
    () => mergeTransactionsWithOverrides(transactions, overrides),
    [transactions, overrides],
  );

  const merged = useMemo(() => {
    if (!dateRange?.from) return allMerged;
    const fromStr = dateRange.from.toISOString().slice(0, 10);
    const toStr = dateRange.to
      ? dateRange.to.toISOString().slice(0, 10)
      : fromStr;
    return allMerged.filter((t) => t.date >= fromStr && t.date <= toStr);
  }, [allMerged, dateRange]);

  const { uniqueCategories, uniqueBanks } = useMemo(() => {
    const cats = new Set<string>();
    const banks = new Set<string>();
    for (const t of merged) {
      if (t.category) cats.add(t.category);
      if (t.bank) banks.add(t.bank);
    }
    return {
      uniqueCategories: [...cats].sort(),
      uniqueBanks: [...banks].sort(),
    };
  }, [merged]);

  const originalCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of transactions) {
      map.set(t.id, t.category);
    }
    return map;
  }, [transactions]);

  const subcategoriesByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    const sets = new Map<string, Set<string>>();
    for (const t of merged) {
      if (!t.category || !t.subcategory) continue;
      let s = sets.get(t.category);
      if (!s) {
        s = new Set();
        sets.set(t.category, s);
      }
      s.add(t.subcategory);
    }
    for (const [cat, s] of sets) {
      map.set(cat, [...s].sort());
    }
    return map;
  }, [merged]);

  const debits = useMemo(() => merged.filter((t) => t.amount < 0), [merged]);
  const coverage = useMemo(() => computeCoverage(debits), [debits]);

  const filteredData = useMemo(() => {
    let data = merged;

    if (statusFilters.length > 0) {
      data = data.filter((t) => {
        return statusFilters.some((status) => {
          if (status === 'transfers')
            return t.is_transfer === true && !t.cancelled_by;
          if (status === 'unverified')
            return !t.verified && !t.ignore && !t.is_transfer;
          if (status === 'verified') return t.verified === true && !t.ignore;
          if (status === 'ignored') return t.ignore === true;
          return true;
        });
      });
    }

    if (bankFilters.length > 0) {
      data = data.filter((t) => bankFilters.includes(t.bank));
    }

    if (categoryFilters.length > 0) {
      data = data.filter(
        (t) => t.category && categoryFilters.includes(t.category),
      );
    }

    const minAmount = amountRange.min ? parseFloat(amountRange.min) : null;
    const maxAmount = amountRange.max ? parseFloat(amountRange.max) : null;
    if (minAmount !== null && !isNaN(minAmount)) {
      data = data.filter((t) => Math.abs(t.amount) >= minAmount);
    }
    if (maxAmount !== null && !isNaN(maxAmount)) {
      data = data.filter((t) => Math.abs(t.amount) <= maxAmount);
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      data = data.filter((t) => t.description.toLowerCase().includes(term));
    }

    return sortMerged(data, sort);
  }, [
    merged,
    statusFilters,
    bankFilters,
    categoryFilters,
    amountRange,
    search,
    sort,
  ]);

  const pageVerifiedCount = useMemo(() => {
    const start = page * pageSize;
    const pageItems = filteredData.slice(start, start + pageSize);
    return pageItems.filter((t) => t.verified === true).length;
  }, [filteredData, page, pageSize]);

  const pageItemCount = useMemo(() => {
    const start = page * pageSize;
    return filteredData.slice(start, start + pageSize).length;
  }, [filteredData, page, pageSize]);

  const handleReset = useCallback(() => {
    setStatusFilters([]);
    setBankFilters([]);
    setCategoryFilters([]);
    setAmountRange({ min: '', max: '' });
    setSort(DEFAULT_SORT);
    setSearch('');
    setPage(0);
    setPageSize(DEFAULT_PAGE_SIZE);
  }, []);

  const handleSortToggle = useCallback(
    (sort_: { key: string; direction: 'asc' | 'desc' } | null) => {
      if (!sort_) {
        setSort(DEFAULT_SORT);
        return;
      }
      const key = sort_.key as SortKey;
      if (key === 'amount' || key === 'date') {
        setSort({ key, direction: sort_.direction });
      }
    },
    [],
  );

  const hasActiveFilters = useMemo(
    () =>
      statusFilters.length > 0 ||
      bankFilters.length > 0 ||
      categoryFilters.length > 0 ||
      amountRange.min !== '' ||
      amountRange.max !== '' ||
      sort.key !== DEFAULT_SORT.key ||
      sort.direction !== DEFAULT_SORT.direction,
    [statusFilters, bankFilters, categoryFilters, amountRange, sort],
  );

  const sortValue = `${sort.key}-${sort.direction}`;

  const toggleFilter = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, value: T) => {
      setter((prev) =>
        prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value],
      );
      setPage(0);
    },
    [],
  );

  const removeStatusFilter = useCallback((value: StatusTab) => {
    setStatusFilters((prev) => prev.filter((v) => v !== value));
    setPage(0);
  }, []);

  const removeBankFilter = useCallback((value: string) => {
    setBankFilters((prev) => prev.filter((v) => v !== value));
    setPage(0);
  }, []);

  const removeCategoryFilter = useCallback((value: string) => {
    setCategoryFilters((prev) => prev.filter((v) => v !== value));
    setPage(0);
  }, []);

  const handleInlineCategory = useCallback(
    (txn: MergedTransaction, newCategory: string) => {
      saveOverride({
        transactionId: txn.id,
        category: newCategory,
        subcategory: txn.subcategory ?? '',
        ...(txn.notes ? { notes: txn.notes } : {}),
        verified: txn.verified ?? false,
        ignore: txn.ignore ?? false,
      });
    },
    [],
  );

  const handleInlineVerify = useCallback((txn: MergedTransaction) => {
    saveOverride({
      transactionId: txn.id,
      category: txn.category ?? '',
      subcategory: txn.subcategory ?? '',
      ...(txn.notes ? { notes: txn.notes } : {}),
      verified: !(txn.verified ?? false),
      ignore: txn.ignore ?? false,
    });
  }, []);

  const handleInlineSubcategory = useCallback(
    (txn: MergedTransaction, newSubcategory: string) => {
      saveOverride({
        transactionId: txn.id,
        category: txn.category ?? '',
        subcategory: newSubcategory,
        ...(txn.notes ? { notes: txn.notes } : {}),
        verified: txn.verified ?? false,
        ignore: txn.ignore ?? false,
      });
    },
    [],
  );

  const handleInlineIgnore = useCallback((txn: MergedTransaction) => {
    saveOverride({
      transactionId: txn.id,
      category: txn.category ?? '',
      subcategory: txn.subcategory ?? '',
      ...(txn.notes ? { notes: txn.notes } : {}),
      verified: txn.verified ?? false,
      ignore: !(txn.ignore ?? false),
    });
  }, []);

  const handleNotesSave = useCallback(
    (txn: MergedTransaction, notes: string) => {
      saveOverride({
        transactionId: txn.id,
        category: txn.category ?? '',
        subcategory: txn.subcategory ?? '',
        ...(notes ? { notes } : {}),
        verified: txn.verified ?? false,
        ignore: txn.ignore ?? false,
      });
    },
    [],
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isTransfersView = useMemo(
    () => statusFilters.length === 1 && statusFilters[0] === 'transfers',
    [statusFilters],
  );

  const transferGroups = useMemo(() => {
    if (!isTransfersView) return null;
    const groups = new Map<number, MergedTransaction[]>();
    for (const t of filteredData) {
      const absAmount = Math.abs(t.amount);
      const existing = groups.get(absAmount);
      if (existing) existing.push(t);
      else groups.set(absAmount, [t]);
    }
    return groups;
  }, [isTransfersView, filteredData]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const cancelOutValidation = useMemo(() => {
    if (selectedIds.size !== 2) {
      return { valid: false, reason: 'Select exactly 2 records to cancel out' };
    }
    const selected = filteredData.filter((t) => selectedIds.has(t.id));
    if (selected.length !== 2) {
      return { valid: false, reason: 'Select exactly 2 records to cancel out' };
    }
    const [a, b] = selected as [MergedTransaction, MergedTransaction];
    if (Math.abs(a.amount) !== Math.abs(b.amount)) {
      return {
        valid: false,
        reason: 'Selected records must have the same absolute amount',
      };
    }
    if (Math.sign(a.amount) === Math.sign(b.amount)) {
      return {
        valid: false,
        reason:
          'Selected records must have opposite signs (one debit, one credit)',
      };
    }
    return { valid: true, reason: '' };
  }, [selectedIds, filteredData]);

  const handleCancelOut = useCallback(() => {
    if (!cancelOutValidation.valid) return;
    const selected = filteredData.filter((t) => selectedIds.has(t.id));
    if (selected.length !== 2) return;
    const [a, b] = selected as [MergedTransaction, MergedTransaction];

    saveOverride({
      transactionId: a.id,
      category: a.category ?? '',
      subcategory: a.subcategory ?? '',
      ...(a.notes ? { notes: a.notes } : {}),
      verified: a.verified ?? false,
      ignore: a.ignore ?? false,
      cancelled_by: b.id,
    });

    saveOverride({
      transactionId: b.id,
      category: b.category ?? '',
      subcategory: b.subcategory ?? '',
      ...(b.notes ? { notes: b.notes } : {}),
      verified: b.verified ?? false,
      ignore: b.ignore ?? false,
      cancelled_by: a.id,
    });

    setSelectedIds(new Set());
  }, [cancelOutValidation.valid, filteredData, selectedIds]);

  const columns: ColumnDef<MergedTransaction>[] = useMemo(
    () => [
      {
        key: 'description',
        header: 'Description',
        sortable: false,
        render: (row) => (
          <span className="text-sm leading-snug">{row.description}</span>
        ),
      },
      {
        key: 'category',
        header: 'Category / Subcategory',
        render: (row) => (
          <div
            className="flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <InlineCategoryCell
              txn={row}
              suggestions={uniqueCategories}
              originalCategory={originalCategoryMap.get(row.id) ?? ''}
              onSave={handleInlineCategory}
            />
            <InlineSubcategoryCell
              txn={row}
              suggestions={
                subcategoriesByCategory.get(row.category ?? '') ?? []
              }
              onSave={handleInlineSubcategory}
            />
          </div>
        ),
      },
      {
        key: 'amount',
        header: 'Amount / Bank',
        render: (row) => (
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span
              className={`font-mono text-sm tabular-nums ${row.amount < 0 ? 'text-destructive' : 'text-positive'}`}
            >
              {row.amount < 0 ? '-' : '+'}
              {formatCurrency(row.amount)}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.bank || '-'} · {row.date}
            </span>
          </div>
        ),
      },
      {
        key: 'notes',
        header: '',
        render: (row) => <NotesDialog txn={row} onSave={handleNotesSave} />,
      },
      {
        key: 'status',
        header: '',
        render: (row) => (
          <InlineStatusCell
            txn={row}
            onVerifyToggle={handleInlineVerify}
            onIgnoreToggle={handleInlineIgnore}
          />
        ),
      },
    ],
    [
      uniqueCategories,
      originalCategoryMap,
      subcategoriesByCategory,
      handleInlineCategory,
      handleInlineSubcategory,
      handleInlineVerify,
      handleInlineIgnore,
      handleNotesSave,
    ],
  );

  if (!loading && transactions.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-4 bg-background px-4 pt-4 pb-4">
        <div className="rounded-lg border bg-card p-4">
          <Progress value={coverage.percentage} className="flex-1">
            <span className="text-sm font-medium">
              {coverage.percentage}% of spend verified
            </span>
          </Progress>
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {pageVerifiedCount} of {pageItemCount} on this page verified
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <MultiSelectCombobox
            label="Status"
            selected={statusFilters}
            options={STATUS_OPTIONS.map((o) => o.value)}
            labels={Object.fromEntries(
              STATUS_OPTIONS.map((o) => [o.value, o.label]),
            )}
            onToggle={(val) => toggleFilter(setStatusFilters, val as StatusTab)}
          />

          <MultiSelectCombobox
            label="Bank"
            selected={bankFilters}
            options={uniqueBanks}
            onToggle={(val) => toggleFilter(setBankFilters, val)}
          />

          <MultiSelectCombobox
            label="Category"
            selected={categoryFilters}
            options={uniqueCategories}
            onToggle={(val) => toggleFilter(setCategoryFilters, val)}
          />

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Amount range
            </span>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                placeholder="Min"
                value={amountRange.min}
                onChange={(e) => {
                  setAmountRange((prev) => ({ ...prev, min: e.target.value }));
                  setPage(0);
                }}
                className="h-9 w-24"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number"
                placeholder="Max"
                value={amountRange.max}
                onChange={(e) => {
                  setAmountRange((prev) => ({ ...prev, max: e.target.value }));
                  setPage(0);
                }}
                className="h-9 w-24"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Sort
            </span>
            <Select
              value={sortValue}
              onValueChange={(val) => {
                const [key, dir] = (val as string).split('-') as [
                  SortKey,
                  SortDirection,
                ];
                setSort({ key, direction: dir });
              }}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            placeholder="Search description..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-9 max-w-xs"
          />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleReset}
                  className="ml-auto min-h-9 min-w-9"
                />
              }
            >
              <RotateCcw className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Reset filters</TooltipContent>
          </Tooltip>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {statusFilters.map((s) => (
              <Badge key={`status-${s}`} variant="secondary" className="gap-1">
                Status: {STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s}
                <button
                  onClick={() => removeStatusFilter(s)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            {bankFilters.map((b) => (
              <Badge key={`bank-${b}`} variant="secondary" className="gap-1">
                Bank: {b}
                <button
                  onClick={() => removeBankFilter(b)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            {categoryFilters.map((c) => (
              <Badge
                key={`category-${c}`}
                variant="secondary"
                className="gap-1"
              >
                Category: {c}
                <button
                  onClick={() => removeCategoryFilter(c)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            {amountRange.min && (
              <Badge variant="secondary" className="gap-1">
                Min: {amountRange.min}
                <button
                  onClick={() =>
                    setAmountRange((prev) => ({ ...prev, min: '' }))
                  }
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            {amountRange.max && (
              <Badge variant="secondary" className="gap-1">
                Max: {amountRange.max}
                <button
                  onClick={() =>
                    setAmountRange((prev) => ({ ...prev, max: '' }))
                  }
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            {(sort.key !== DEFAULT_SORT.key ||
              sort.direction !== DEFAULT_SORT.direction) && (
              <Badge variant="secondary" className="gap-1">
                Sort:{' '}
                {SORT_OPTIONS.find((o) => o.value === sortValue)?.label ??
                  sortValue}
                <button
                  onClick={() => setSort(DEFAULT_SORT)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-5 px-2 text-xs"
            >
              Clear All
            </Button>
          </div>
        )}

        <Separator />
      </div>

      {isTransfersView && transferGroups ? (
        <TransfersGroupedTable
          groups={transferGroups}
          columns={columns}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          cancelOutValidation={cancelOutValidation}
          onCancelOut={handleCancelOut}
          loading={loading}
        />
      ) : (
        <DataTable
          data={filteredData}
          columns={columns}
          sort={sort ? { key: sort.key, direction: sort.direction } : null}
          setSort={handleSortToggle}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          getRowId={(row) => row.id}
          loading={loading}
          emptyState="No transactions match the current filters."
        />
      )}
    </div>
  );
}

function TransfersGroupedTable({
  groups,
  columns,
  selectedIds,
  onToggleSelection,
  cancelOutValidation,
  onCancelOut,
  loading,
}: {
  groups: Map<number, MergedTransaction[]>;
  columns: ColumnDef<MergedTransaction>[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  cancelOutValidation: { valid: boolean; reason: string };
  onCancelOut: () => void;
  loading: boolean;
}) {
  const colCount = columns.length + 1;
  const sortedGroups = useMemo(
    () => [...groups.entries()].sort(([a], [b]) => b - a),
    [groups],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="default"
                size="sm"
                disabled={!cancelOutValidation.valid}
                onClick={onCancelOut}
              />
            }
          >
            Cancel Out
          </TooltipTrigger>
          <TooltipContent>
            {cancelOutValidation.valid
              ? 'Cancel out the selected pair'
              : cancelOutValidation.reason}
          </TooltipContent>
        </Tooltip>
        {selectedIds.size > 0 && (
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </span>
        )}
      </div>

      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            {columns.map((col) => (
              <TableHead key={col.key}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={colCount} className="h-24 text-center">
                Loading...
              </TableCell>
            </TableRow>
          ) : sortedGroups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="h-24 text-center">
                No unmatched transfers found.
              </TableCell>
            </TableRow>
          ) : (
            sortedGroups.map(([absAmount, rows]) => (
              <Fragment key={absAmount}>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableCell
                    colSpan={colCount}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {formatCurrency(absAmount)}
                    <span className="ml-1.5 text-[10px] font-normal">
                      ({rows.length} {rows.length === 1 ? 'record' : 'records'})
                    </span>
                  </TableCell>
                </TableRow>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="w-10 py-3">
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => onToggleSelection(row.id)}
                      />
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="py-3">
                        {col.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const InlineCategoryCell = memo(function InlineCategoryCell({
  txn,
  suggestions,
  originalCategory,
  onSave,
}: {
  txn: MergedTransaction;
  suggestions: string[];
  originalCategory: string;
  onSave: (txn: MergedTransaction, category: string) => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const wasOverridden =
    txn.category !== originalCategory && originalCategory !== '';

  const handleValueChange = useCallback(
    (val: string | null) => {
      if (val) {
        onSave(txn, val);
      }
    },
    [txn, onSave],
  );

  const handleInputValueChange = useCallback((val: string) => {
    setInputValue(val);
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        onSave(txn, inputValue.trim());
        e.currentTarget.blur();
      }
    },
    [txn, inputValue, onSave],
  );

  return (
    <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Combobox
        value={txn.category || null}
        onValueChange={handleValueChange}
        onInputValueChange={handleInputValueChange}
      >
        <ComboboxInput
          placeholder="Set category..."
          className="h-8 w-36 text-sm"
          onKeyDown={handleInputKeyDown}
        />
        <ComboboxContent>
          <ComboboxList>
            {suggestions.map((cat) => (
              <ComboboxItem key={cat} value={cat}>
                {cat}
              </ComboboxItem>
            ))}
          </ComboboxList>
          <ComboboxEmpty>No matches</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
      <span
        className={`h-[18px] px-1.5 text-[11px] italic ${wasOverridden ? 'text-muted-foreground' : 'invisible'}`}
      >
        was: {wasOverridden ? originalCategory || '-' : ' '}
      </span>
    </div>
  );
});

const InlineStatusCell = memo(function InlineStatusCell({
  txn,
  onVerifyToggle,
  onIgnoreToggle,
}: {
  txn: MergedTransaction;
  onVerifyToggle: (txn: MergedTransaction) => void;
  onIgnoreToggle: (txn: MergedTransaction) => void;
}) {
  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {txn.cancelled_by && <Badge variant="destructive">Cancelled</Badge>}

      {!txn.cancelled_by && !txn.is_transfer && (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={txn.verified ? 'default' : 'outline'}
                  size="icon"
                  className="min-h-7 min-w-7 size-7"
                  onClick={() => onVerifyToggle(txn)}
                />
              }
            >
              <Check className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              {txn.verified ? 'Unverify' : 'Mark verified'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={txn.ignore ? 'secondary' : 'ghost'}
                  size="icon"
                  className="min-h-7 min-w-7 size-7"
                  onClick={() => onIgnoreToggle(txn)}
                />
              }
            >
              <EyeOff className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              {txn.ignore ? 'Unignore' : 'Ignore'}
            </TooltipContent>
          </Tooltip>
        </>
      )}

      {txn.is_transfer && <Badge variant="outline">Transfer</Badge>}
    </div>
  );
});

const InlineSubcategoryCell = memo(function InlineSubcategoryCell({
  txn,
  suggestions,
  onSave,
}: {
  txn: MergedTransaction;
  suggestions: string[];
  onSave: (txn: MergedTransaction, subcategory: string) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleValueChange = useCallback(
    (val: string | null) => {
      if (val) onSave(txn, val);
    },
    [txn, onSave],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        onSave(txn, inputValue.trim());
        e.currentTarget.blur();
      }
    },
    [txn, inputValue, onSave],
  );

  return (
    <Combobox
      value={txn.subcategory || null}
      onValueChange={handleValueChange}
      onInputValueChange={setInputValue}
    >
      <ComboboxInput
        placeholder="Subcategory..."
        className="h-7 w-36 text-xs"
        onKeyDown={handleInputKeyDown}
      />
      <ComboboxContent>
        <ComboboxList>
          {suggestions.map((sub) => (
            <ComboboxItem key={sub} value={sub}>
              {sub}
            </ComboboxItem>
          ))}
        </ComboboxList>
        <ComboboxEmpty>Press Enter to save</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
});

const NotesDialog = memo(function NotesDialog({
  txn,
  onSave,
}: {
  txn: MergedTransaction;
  onSave: (txn: MergedTransaction, notes: string) => void;
}) {
  const existingNotes = txn.notes ?? '';
  const hasNotes = existingNotes.length > 0;
  const [notes, setNotes] = useState(existingNotes);
  const [open, setOpen] = useState(false);

  const handleSave = useCallback(() => {
    onSave(txn, notes);
    setOpen(false);
  }, [txn, notes, onSave]);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              variant={hasNotes ? 'secondary' : 'ghost'}
              size="icon"
              className="min-h-7 min-w-7 size-7"
            />
          }
        >
          <StickyNote
            className={`size-3.5 ${hasNotes ? 'text-foreground' : 'text-muted-foreground'}`}
          />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notes</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes..."
            rows={4}
          />
          <DialogFooter>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

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
          replaceTransactions(decoded.transactions as never);
          setError(null);
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
