import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { Badge } from '@monorepo/frontend/components/ui/badge';
import { Skeleton } from '@monorepo/frontend/components/ui/skeleton';
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@monorepo/frontend/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  ChevronRight,
  Circle,
  CircleCheck,
  EyeOff,
  RotateCcw,
  StickyNote,
  Undo2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  ProjectionOutputSchema,
  filterByTriageTab,
  filterCancelled,
  groupCancelledPairs,
  computeMatchablePairs,
  type CancelledGroup,
} from '@/domain';
import { DataTable, type ColumnDef } from '@/routes/components/data-table';
import {
  transactionsCollection,
  replaceTransactions,
  overridesCollection,
  overridesUtils,
} from '@/routes/internal/collections';
import { useDateRange, useTriageStore } from '@/routes/internal/stores';
import { FinancesClient, financesRuntime } from '@/routes/internal/effect';
import { computeCoverage, type MergedTransaction } from '@/orchestration';
const COMPACT_BREAKPOINT = 1024;

function useIsCompact() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${COMPACT_BREAKPOINT - 1}px)`);
    const onChange = () => setIsCompact(mql.matches);
    mql.addEventListener('change', onChange);
    setIsCompact(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isCompact;
}

type TriageTab = 'all' | 'unresolved' | 'resolved' | 'ignored';
type CancelTab = 'cancel-out' | 'cancelled';
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

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'date-desc', label: 'Date newest' },
  { value: 'date-asc', label: 'Date oldest' },
  { value: 'amount-desc', label: 'Amount highest' },
  { value: 'amount-asc', label: 'Amount lowest' },
];

const DEFAULT_SORT: SortConfig = { key: 'amount', direction: 'desc' };

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
        <ComboboxInput
          placeholder={displayLabel}
          className="h-9 w-full sm:w-40"
        />
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

function applyUserFilters(
  data: MergedTransaction[],
  filters: {
    bankFilters: string[];
    categoryFilters: string[];
    ownerFilters: string[];
    amountRange: AmountRange;
    search: string;
  },
): MergedTransaction[] {
  let result = data;

  if (filters.bankFilters.length > 0) {
    result = result.filter((t) => filters.bankFilters.includes(t.bank));
  }
  if (filters.categoryFilters.length > 0) {
    result = result.filter(
      (t) => t.category && filters.categoryFilters.includes(t.category),
    );
  }
  if (filters.ownerFilters.length > 0) {
    result = result.filter(
      (t) => t.owner && filters.ownerFilters.includes(t.owner),
    );
  }

  const minAmount = filters.amountRange.min
    ? parseFloat(filters.amountRange.min)
    : null;
  const maxAmount = filters.amountRange.max
    ? parseFloat(filters.amountRange.max)
    : null;
  if (minAmount !== null && !isNaN(minAmount)) {
    result = result.filter((t) => Math.abs(t.amount) >= minAmount);
  }
  if (maxAmount !== null && !isNaN(maxAmount)) {
    result = result.filter((t) => Math.abs(t.amount) <= maxAmount);
  }

  if (filters.search.trim()) {
    const term = filters.search.trim().toLowerCase();
    result = result.filter((t) => t.description.toLowerCase().includes(term));
  }

  return result;
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
  const { data: allMerged = [], isLoading: loading } = useLiveQuery((q) =>
    q
      .from({ t: transactionsCollection })
      .leftJoin({ o: overridesCollection }, ({ t, o }) =>
        eq(t.id, o.transactionId),
      )
      .select(({ t, o }) => ({
        id: t.id,
        date: t.date,
        owner: t.owner,
        bank: t.bank,
        description: t.description,
        amount: t.amount,
        type: t.type,
        original_category: t.category,
        category: coalesce(o.category, t.category),
        subcategory: coalesce(o.subcategory, t.subcategory),
        is_transfer: t.is_transfer,
        notes: o.notes,
        verified: o.verified,
        ignore: o.ignore,
        cancelled_by: o.cancelled_by,
      })),
  );
  const { dateRange } = useDateRange();

  const {
    activeTriageTab,
    setActiveTriageTab,
    activeCancelTab,
    setActiveCancelTab,
    notesOpenId,
    setNotesOpenId,
    bankFilters,
    setBankFilters,
    categoryFilters,
    setCategoryFilters,
    ownerFilters,
    setOwnerFilters,
    amountRange,
    setAmountRange,
    sort,
    setSort,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    selectedIds,
    setSelectedIds,
    resetFilters,
  } = useTriageStore();

  const merged = useMemo(() => {
    if (!dateRange?.from) return allMerged;
    const fromStr = dateRange.from.toISOString().slice(0, 10);
    const toStr = dateRange.to
      ? dateRange.to.toISOString().slice(0, 10)
      : fromStr;
    return allMerged.filter((t) => t.date >= fromStr && t.date <= toStr);
  }, [allMerged, dateRange]);

  const { uniqueCategories, uniqueBanks, uniqueOwners } = useMemo(() => {
    const cats = new Set<string>();
    const banks = new Set<string>();
    const owners = new Set<string>();
    for (const t of allMerged) {
      if (t.category) cats.add(t.category);
      if (t.bank) banks.add(t.bank);
      if (t.owner) owners.add(t.owner);
    }
    return {
      uniqueCategories: [...cats].sort(),
      uniqueBanks: [...banks].sort(),
      uniqueOwners: [...owners].sort(),
    };
  }, [allMerged]);

  const originalCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of merged) {
      map.set(t.id, t.original_category ?? t.category);
    }
    return map;
  }, [merged]);

  const subcategoriesByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    const sets = new Map<string, Set<string>>();
    for (const t of allMerged) {
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
  }, [allMerged]);

  const debits = useMemo(() => merged.filter((t) => t.amount < 0), [merged]);
  const coverage = useMemo(() => computeCoverage(debits), [debits]);

  const userFilters = useMemo(
    () => ({ bankFilters, categoryFilters, ownerFilters, amountRange, search }),
    [bankFilters, categoryFilters, ownerFilters, amountRange, search],
  );

  const triageData = useMemo(() => {
    if (activeCancelTab !== null) return [];
    const data = filterByTriageTab(merged, activeTriageTab);
    return sortMerged(applyUserFilters(data, userFilters), sort);
  }, [activeCancelTab, merged, activeTriageTab, userFilters, sort]);

  const cancelledGroups = useMemo(() => {
    if (activeCancelTab !== 'cancelled') return [];
    const filtered = applyUserFilters(filterCancelled(merged), userFilters);
    return groupCancelledPairs(filtered);
  }, [activeCancelTab, merged, userFilters]);

  const matchablePairs = useMemo(() => {
    if (activeCancelTab !== 'cancel-out') return null;
    const filtered = applyUserFilters(merged, userFilters);
    return computeMatchablePairs(filtered);
  }, [activeCancelTab, merged, userFilters]);

  const pageResolvedCount = useMemo(() => {
    const start = page * pageSize;
    const pageItems = triageData.slice(start, start + pageSize);
    return pageItems.filter((t) => t.verified === true).length;
  }, [triageData, page, pageSize]);

  const pageItemCount = useMemo(() => {
    const start = page * pageSize;
    return triageData.slice(start, start + pageSize).length;
  }, [triageData, page, pageSize]);

  const handleReset = useCallback(() => {
    resetFilters();
  }, [resetFilters]);

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
      bankFilters.length > 0 ||
      categoryFilters.length > 0 ||
      ownerFilters.length > 0 ||
      amountRange.min !== '' ||
      amountRange.max !== '' ||
      sort.key !== DEFAULT_SORT.key ||
      sort.direction !== DEFAULT_SORT.direction,
    [bankFilters, categoryFilters, ownerFilters, amountRange, sort],
  );

  const sortValue = `${sort.key}-${sort.direction}`;

  const toggleBankFilter = useCallback(
    (value: string) => {
      setBankFilters(
        bankFilters.includes(value)
          ? bankFilters.filter((v) => v !== value)
          : [...bankFilters, value],
      );
      setPage(0);
    },
    [bankFilters, setBankFilters, setPage],
  );

  const toggleCategoryFilter = useCallback(
    (value: string) => {
      setCategoryFilters(
        categoryFilters.includes(value)
          ? categoryFilters.filter((v) => v !== value)
          : [...categoryFilters, value],
      );
      setPage(0);
    },
    [categoryFilters, setCategoryFilters, setPage],
  );

  const toggleOwnerFilter = useCallback(
    (value: string) => {
      setOwnerFilters(
        ownerFilters.includes(value)
          ? ownerFilters.filter((v) => v !== value)
          : [...ownerFilters, value],
      );
      setPage(0);
    },
    [ownerFilters, setOwnerFilters, setPage],
  );

  const removeBankFilter = useCallback(
    (value: string) => {
      setBankFilters(bankFilters.filter((v) => v !== value));
      setPage(0);
    },
    [bankFilters, setBankFilters, setPage],
  );

  const removeCategoryFilter = useCallback(
    (value: string) => {
      setCategoryFilters(categoryFilters.filter((v) => v !== value));
      setPage(0);
    },
    [categoryFilters, setCategoryFilters, setPage],
  );

  const removeOwnerFilter = useCallback(
    (value: string) => {
      setOwnerFilters(ownerFilters.filter((v) => v !== value));
      setPage(0);
    },
    [ownerFilters, setOwnerFilters, setPage],
  );

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

  const handleUncancel = useCallback((group: CancelledGroup) => {
    for (const txn of group.transactions) {
      saveOverride({
        transactionId: txn.id,
        category: txn.category ?? '',
        subcategory: txn.subcategory ?? '',
        ...(txn.notes ? { notes: txn.notes } : {}),
        verified: txn.verified ?? false,
        ignore: txn.ignore ?? false,
        cancelled_by: null,
      });
    }
  }, []);

  const toggleSelection = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
    },
    [selectedIds, setSelectedIds],
  );

  const cancelOutSource = useMemo(() => {
    if (!matchablePairs) return [];
    const all: MergedTransaction[] = [];
    for (const rows of matchablePairs.values()) {
      all.push(...rows);
    }
    return all;
  }, [matchablePairs]);

  const cancelOutValidation = useMemo(() => {
    if (selectedIds.size !== 2) {
      return { valid: false, reason: 'Select exactly 2 records to cancel out' };
    }
    const selected = cancelOutSource.filter((t) => selectedIds.has(t.id));
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
  }, [selectedIds, cancelOutSource]);

  const handleCancelOut = useCallback(() => {
    if (!cancelOutValidation.valid) return;
    const selected = cancelOutSource.filter((t) => selectedIds.has(t.id));
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
  }, [cancelOutValidation.valid, cancelOutSource, selectedIds]);

  const isCompact = useIsCompact();

  const columns: ColumnDef<MergedTransaction>[] = useMemo(
    () => [
      {
        key: 'description',
        header: 'Description',
        sortable: false,
        className: 'w-[40%]',
        render: (row) => (
          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-snug group-hover/row:overflow-visible group-hover/row:whitespace-normal">
            {row.description}
          </span>
        ),
      },
      {
        key: 'category',
        header: 'Category / Subcategory',
        className: '',
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
        header: 'Amount',
        className: 'whitespace-nowrap',
        render: (row) => (
          <span
            className={`font-mono text-sm tabular-nums ${row.amount < 0 ? 'text-destructive' : 'text-positive'}`}
          >
            {row.amount < 0 ? '-' : '+'}
            {formatCurrency(row.amount)}
          </span>
        ),
      },
      {
        key: 'bank',
        header: 'Bank',
        className: '',
        render: (row) => (
          <div className="flex flex-col">
            <span className="text-sm text-muted-foreground">
              {row.bank || '-'}
            </span>
            {row.owner && (
              <span className="text-xs font-semibold">{row.owner}</span>
            )}
          </div>
        ),
      },
      {
        key: 'date',
        header: 'Date',
        className: 'whitespace-nowrap',
        render: (row) => (
          <span className="text-sm text-muted-foreground">{row.date}</span>
        ),
      },
      {
        key: 'notes',
        header: '',
        className: 'relative w-11 min-w-11 !p-0',
        onCellClick: (row, e) => {
          e.stopPropagation();
          setNotesOpenId(row.id);
        },
        render: (row) => {
          const hasNotes = (row.notes ?? '').length > 0;
          return (
            <div className="absolute inset-0 flex min-h-10 items-center justify-center transition-colors hover:bg-muted">
              <StickyNote
                className={`size-4 ${hasNotes ? 'text-primary' : 'text-muted-foreground'}`}
              />
            </div>
          );
        },
      },
      {
        key: 'status',
        header: '',
        className: 'relative w-11 min-w-11 !p-0',
        onCellClick: (row, e) => {
          e.stopPropagation();
          if (row.ignore) {
            handleInlineIgnore(row);
          } else {
            handleInlineVerify(row);
          }
        },
        render: (row) => (
          <ContextMenu>
            <ContextMenuTrigger className="absolute inset-0 flex min-h-10 items-center justify-center transition-colors hover:bg-muted">
              {row.ignore ? (
                <EyeOff className="size-4 text-muted-foreground" />
              ) : row.verified ? (
                <CircleCheck className="size-4 text-primary" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleInlineIgnore(row);
                }}
              >
                <EyeOff className="size-4" />
                {row.ignore ? 'Unignore' : 'Ignore'}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
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

  const handleTriageTabClick = useCallback((tab: TriageTab) => {
    setActiveTriageTab(tab);
    setActiveCancelTab(null);
    setPage(0);
  }, []);

  const handleCancelTabClick = useCallback((tab: CancelTab) => {
    setActiveCancelTab(tab);
    setPage(0);
    setSelectedIds(new Set());
  }, []);

  if (!loading && allMerged.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 -mx-4 -mt-4 flex flex-col gap-4 bg-background px-4 pt-4 pb-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <Progress value={coverage.percentage} className="flex-1">
              <span className="text-sm font-medium">
                {coverage.percentage}% of spend resolved
              </span>
            </Progress>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {loading ? (
                <>Syncing... ({merged.length} loaded)</>
              ) : triageData.length !== merged.length ? (
                <>
                  {triageData.length} of {merged.length} records
                </>
              ) : (
                <>{merged.length} records</>
              )}
            </span>
          </div>
          {activeCancelTab === null && !loading && (
            <span className="mt-1.5 block text-xs text-muted-foreground">
              {pageResolvedCount} of {pageItemCount} on this page resolved
            </span>
          )}
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-1 rounded-md bg-muted p-1">
            {(['all', 'unresolved', 'resolved', 'ignored'] as TriageTab[]).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTriageTabClick(tab)}
                  className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                    activeCancelTab === null && activeTriageTab === tab
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ),
            )}
          </div>

          <div className="flex items-center gap-1 rounded-md bg-muted p-1">
            {(['cancel-out', 'cancelled'] as CancelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleCancelTabClick(tab)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  activeCancelTab === tab
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'cancel-out' ? 'Cancel Out' : 'Cancelled'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <MultiSelectCombobox
            label="Owner"
            selected={ownerFilters}
            options={uniqueOwners}
            onToggle={toggleOwnerFilter}
          />

          <MultiSelectCombobox
            label="Bank"
            selected={bankFilters}
            options={uniqueBanks}
            onToggle={toggleBankFilter}
          />

          <MultiSelectCombobox
            label="Category"
            selected={categoryFilters}
            options={uniqueCategories}
            onToggle={toggleCategoryFilter}
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
                  setAmountRange({ ...amountRange, min: e.target.value });
                  setPage(0);
                }}
                className="h-9 w-20 sm:w-24"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number"
                placeholder="Max"
                value={amountRange.max}
                onChange={(e) => {
                  setAmountRange({ ...amountRange, max: e.target.value });
                  setPage(0);
                }}
                className="h-9 w-20 sm:w-24"
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
              <SelectTrigger className="h-9 w-full sm:w-40">
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
            {ownerFilters.map((o) => (
              <Badge key={`owner-${o}`} variant="secondary" className="gap-1">
                Owner: {o}
                <button
                  onClick={() => removeOwnerFilter(o)}
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
                  onClick={() => setAmountRange({ ...amountRange, min: '' })}
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
                  onClick={() => setAmountRange({ ...amountRange, max: '' })}
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

      {activeCancelTab === 'cancel-out' && matchablePairs ? (
        isCompact ? (
          <MobileCancelOutCards
            groups={matchablePairs}
            selectedIds={selectedIds}
            onToggleSelection={toggleSelection}
            cancelOutValidation={cancelOutValidation}
            onCancelOut={handleCancelOut}
            loading={loading}
          />
        ) : (
          <CancelOutGroupedTable
            groups={matchablePairs}
            columns={columns}
            selectedIds={selectedIds}
            onToggleSelection={toggleSelection}
            cancelOutValidation={cancelOutValidation}
            onCancelOut={handleCancelOut}
            loading={loading}
          />
        )
      ) : activeCancelTab === 'cancelled' ? (
        <CancelledView
          groups={cancelledGroups}
          onUncancel={handleUncancel}
          loading={loading}
        />
      ) : isCompact ? (
        <MobileTriageCards
          data={triageData}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          uniqueCategories={uniqueCategories}
          originalCategoryMap={originalCategoryMap}
          subcategoriesByCategory={subcategoriesByCategory}
          onCategoryChange={handleInlineCategory}
          onSubcategoryChange={handleInlineSubcategory}
          onVerify={handleInlineVerify}
          onIgnore={handleInlineIgnore}
          onNotesOpen={setNotesOpenId}
          loading={loading}
        />
      ) : (
        <DataTable
          data={triageData}
          columns={columns}
          sort={sort ? { key: sort.key, direction: sort.direction } : null}
          setSort={handleSortToggle}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          getRowId={(row) => row.id}
          loading={loading}
          getRowClassName={(row, _index) => {
            if (row.ignore) return 'line-through opacity-60';
            return '';
          }}
          emptyState="No transactions match the current filters."
        />
      )}
      <NotesDialog
        txn={merged.find((t) => t.id === notesOpenId) ?? null}
        open={notesOpenId !== null}
        onOpenChange={(open) => {
          if (!open) setNotesOpenId(null);
        }}
        onSave={handleNotesSave}
      />
    </div>
  );
}

function CancelOutGroupedTable({
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

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const toggleGroup = useCallback((amount: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(amount)) next.delete(amount);
      else next.add(amount);
      return next;
    });
  }, []);

  const [page, setPage] = useState(0);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sortedGroups.length / pageSize));
  const visibleGroups = sortedGroups.slice(
    page * pageSize,
    (page + 1) * pageSize,
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

      <div className="overflow-hidden">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
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
            ) : visibleGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="h-24 text-center">
                  No matchable pairs found.
                </TableCell>
              </TableRow>
            ) : (
              visibleGroups.map(([absAmount, rows]) => (
                <Fragment key={absAmount}>
                  <TableRow
                    className="cursor-pointer bg-muted/50 hover:bg-muted/50"
                    onClick={() => toggleGroup(absAmount)}
                  >
                    <TableCell
                      colSpan={colCount}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      <ChevronRight
                        className={`mr-1.5 inline-block size-3.5 transition-transform ${expandedGroups.has(absAmount) ? 'rotate-90' : ''}`}
                      />
                      {formatCurrency(absAmount)}
                      <span className="ml-1.5 text-[10px] font-normal">
                        ({rows.length}{' '}
                        {rows.length === 1 ? 'record' : 'records'})
                      </span>
                    </TableCell>
                  </TableRow>
                  {expandedGroups.has(absAmount) &&
                    rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="group/row cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() => onToggleSelection(row.id)}
                      >
                        <TableCell className="w-10 py-3">
                          <Checkbox
                            checked={selectedIds.has(row.id)}
                            onCheckedChange={() => onToggleSelection(row.id)}
                          />
                        </TableCell>
                        {columns.map((col) => (
                          <TableCell
                            key={col.key}
                            className={`py-3 ${col.className ?? ''} ${col.onCellClick ? 'cursor-pointer' : ''}`}
                            onClick={
                              col.onCellClick
                                ? (e) => {
                                    e.stopPropagation();
                                    col.onCellClick!(row, e);
                                  }
                                : undefined
                            }
                          >
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function MobileCancelOutCards({
  groups,
  selectedIds,
  onToggleSelection,
  cancelOutValidation,
  onCancelOut,
  loading,
}: {
  groups: Map<number, MergedTransaction[]>;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  cancelOutValidation: { valid: boolean; reason: string };
  onCancelOut: () => void;
  loading: boolean;
}) {
  const sortedGroups = useMemo(
    () => [...groups.entries()].sort(([a], [b]) => b - a),
    [groups],
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const toggleGroup = useCallback((amount: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(amount)) next.delete(amount);
      else next.add(amount);
      return next;
    });
  }, []);

  const [page, setPage] = useState(0);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sortedGroups.length / pageSize));
  const visibleGroups = sortedGroups.slice(
    page * pageSize,
    (page + 1) * pageSize,
  );

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="default"
          size="sm"
          disabled={!cancelOutValidation.valid}
          onClick={onCancelOut}
        >
          Cancel Out
        </Button>
        {selectedIds.size > 0 && (
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </span>
        )}
        {!cancelOutValidation.valid && selectedIds.size > 0 && (
          <span className="text-xs text-muted-foreground">
            {cancelOutValidation.reason}
          </span>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          No matchable pairs found.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleGroups.map(([absAmount, rows]) => (
            <div key={absAmount} className="rounded-lg border bg-card">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                onClick={() => toggleGroup(absAmount)}
              >
                <ChevronRight
                  className={`size-3.5 shrink-0 transition-transform ${expandedGroups.has(absAmount) ? 'rotate-90' : ''}`}
                />
                <span className="text-sm font-medium">
                  {formatCurrency(absAmount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({rows.length} {rows.length === 1 ? 'record' : 'records'})
                </span>
              </button>
              {expandedGroups.has(absAmount) && (
                <div className="border-t">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className={`flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0 ${selectedIds.has(row.id) ? 'bg-primary/5' : ''}`}
                      onClick={() => onToggleSelection(row.id)}
                    >
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => onToggleSelection(row.id)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 text-sm leading-snug">
                            {row.description}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-sm tabular-nums ${row.amount < 0 ? 'text-destructive' : 'text-positive'}`}
                          >
                            {row.amount < 0 ? '-' : '+'}
                            {formatCurrency(row.amount)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{row.bank || '-'}</span>
                          {row.owner && (
                            <span className="font-semibold">{row.owner}</span>
                          )}
                          <span>{row.date}</span>
                          {row.category && <span>{row.category}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">
          {page + 1} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function CancelledView({
  groups,
  onUncancel,
  loading,
}: {
  groups: CancelledGroup[];
  onUncancel: (group: CancelledGroup) => void;
  loading: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const visible = groups.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No cancelled transactions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {visible.map((group) => {
          const key = group.transactions.map((t) => t.id).join('-');
          return (
            <div key={key} className="rounded-lg border bg-card">
              {group.transactions.map((txn, i) => (
                <div
                  key={txn.id}
                  className={`group/row flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${
                    i < group.transactions.length - 1
                      ? 'border-b border-dashed'
                      : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm group-hover/row:overflow-visible group-hover/row:whitespace-normal">
                    {txn.description}
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {txn.category ?? '-'}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-sm tabular-nums ${txn.amount < 0 ? 'text-destructive' : 'text-positive'}`}
                  >
                    {txn.amount < 0 ? '-' : '+'}
                    {formatCurrency(txn.amount)}
                  </span>
                  <span className="w-16 shrink-0 text-sm text-muted-foreground">
                    {txn.bank || '-'}
                  </span>
                  <span className="w-24 shrink-0 text-sm text-muted-foreground">
                    {txn.date}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-end border-t px-4 py-2">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => onUncancel(group)}
                      />
                    }
                  >
                    <Undo2 className="size-3.5" />
                    Uncancel
                  </TooltipTrigger>
                  <TooltipContent>
                    {group.type === 'pair'
                      ? 'Restore both transactions'
                      : 'Restore this transaction'}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function useRowHover() {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const row = el?.closest('tr');
    if (!row) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    row.addEventListener('pointerenter', enter);
    row.addEventListener('pointerleave', leave);
    return () => {
      row.removeEventListener('pointerenter', enter);
      row.removeEventListener('pointerleave', leave);
    };
  }, []);

  return { ref, hovered };
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
  const { ref, hovered } = useRowHover();
  const [open, setOpen] = useState(false);
  const active = hovered || open;
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
    <div
      ref={ref}
      className="flex flex-col gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <Combobox
        value={txn.category || null}
        onValueChange={handleValueChange}
        onInputValueChange={handleInputValueChange}
        onOpenChange={(o) => setOpen(o)}
      >
        <ComboboxInput
          placeholder="Set category..."
          className={`h-8 w-full text-sm ${!active ? 'pointer-events-none border-transparent shadow-none' : ''}`}
          onKeyDown={handleInputKeyDown}
          showTrigger={active}
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
        was: {wasOverridden ? originalCategory || '-' : ' '}
      </span>
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
  const { ref, hovered } = useRowHover();
  const [open, setOpen] = useState(false);
  const active = hovered || open;
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
    <div ref={ref}>
      <Combobox
        value={txn.subcategory || null}
        onValueChange={handleValueChange}
        onInputValueChange={setInputValue}
        onOpenChange={(o) => setOpen(o)}
      >
        <ComboboxInput
          placeholder="Subcategory..."
          className={`h-7 w-full text-xs ${!active ? 'pointer-events-none border-transparent shadow-none' : ''}`}
          onKeyDown={handleInputKeyDown}
          showTrigger={active}
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
    </div>
  );
});

const NotesDialog = memo(function NotesDialog({
  txn,
  onSave,
  open,
  onOpenChange,
}: {
  txn: MergedTransaction | null;
  onSave: (txn: MergedTransaction, notes: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const existingNotes = txn?.notes ?? '';
  const [notes, setNotes] = useState(existingNotes);

  const prevOpen = useRef(open);
  if (open && !prevOpen.current) {
    setNotes(existingNotes);
  }
  prevOpen.current = open;

  const handleSave = useCallback(() => {
    if (txn) onSave(txn, notes);
    onOpenChange(false);
  }, [txn, notes, onSave, onOpenChange]);

  const handleDelete = useCallback(() => {
    if (txn) onSave(txn, '');
    onOpenChange(false);
  }, [txn, onSave, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          {existingNotes && (
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

const MobileInlineCategoryCell = memo(function MobileInlineCategoryCell({
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
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const wasOverridden =
    txn.category !== originalCategory && originalCategory !== '';

  const handleValueChange = useCallback(
    (val: string | null) => {
      if (val) {
        onSave(txn, val);
        setEditing(false);
      }
    },
    [txn, onSave],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        onSave(txn, inputValue.trim());
        setEditing(false);
      }
    },
    [txn, inputValue, onSave],
  );

  if (editing) {
    return (
      <Combobox
        value={txn.category || null}
        onValueChange={handleValueChange}
        onInputValueChange={setInputValue}
        onOpenChange={(o) => {
          if (!o) setEditing(false);
        }}
      >
        <ComboboxInput
          placeholder="Set category..."
          className="h-8 w-full text-sm"
          onKeyDown={handleInputKeyDown}
          autoFocus
        />
        <ComboboxContent>
          <ComboboxList>
            {suggestions.map((cat) => (
              <ComboboxItem key={cat} value={cat}>
                {cat}
              </ComboboxItem>
            ))}
          </ComboboxList>
          <ComboboxEmpty>Press Enter to save</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
    );
  }

  return (
    <button
      type="button"
      className="flex items-center gap-1 text-left text-sm"
      onClick={() => setEditing(true)}
    >
      <span className="truncate">
        {txn.category || (
          <span className="text-muted-foreground">Set category...</span>
        )}
      </span>
      {wasOverridden && (
        <span className="text-[10px] italic text-muted-foreground">
          (was: {originalCategory})
        </span>
      )}
    </button>
  );
});

const MobileInlineSubcategoryCell = memo(function MobileInlineSubcategoryCell({
  txn,
  suggestions,
  onSave,
}: {
  txn: MergedTransaction;
  suggestions: string[];
  onSave: (txn: MergedTransaction, subcategory: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleValueChange = useCallback(
    (val: string | null) => {
      if (val) {
        onSave(txn, val);
        setEditing(false);
      }
    },
    [txn, onSave],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        onSave(txn, inputValue.trim());
        setEditing(false);
      }
    },
    [txn, inputValue, onSave],
  );

  if (editing) {
    return (
      <Combobox
        value={txn.subcategory || null}
        onValueChange={handleValueChange}
        onInputValueChange={setInputValue}
        onOpenChange={(o) => {
          if (!o) setEditing(false);
        }}
      >
        <ComboboxInput
          placeholder="Subcategory..."
          className="h-7 w-full text-xs"
          onKeyDown={handleInputKeyDown}
          autoFocus
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
  }

  return (
    <button
      type="button"
      className="text-left text-xs"
      onClick={() => setEditing(true)}
    >
      {txn.subcategory || (
        <span className="text-muted-foreground">Subcategory...</span>
      )}
    </button>
  );
});

function MobileTriageCards({
  data,
  page,
  setPage,
  pageSize,
  setPageSize,
  uniqueCategories,
  originalCategoryMap,
  subcategoriesByCategory,
  onCategoryChange,
  onSubcategoryChange,
  onVerify,
  onIgnore,
  onNotesOpen,
  loading,
}: {
  data: MergedTransaction[];
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (s: number) => void;
  uniqueCategories: string[];
  originalCategoryMap: Map<string, string>;
  subcategoriesByCategory: Map<string, string[]>;
  onCategoryChange: (txn: MergedTransaction, category: string) => void;
  onSubcategoryChange: (txn: MergedTransaction, subcategory: string) => void;
  onVerify: (txn: MergedTransaction) => void;
  onIgnore: (txn: MergedTransaction) => void;
  onNotesOpen: (id: string) => void;
  loading: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const start = page * pageSize;
  const visibleRows = data.slice(start, start + pageSize);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <Skeleton className="mb-2 h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (visibleRows.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
        No transactions match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {visibleRows.map((txn) => {
          const rowOpacity = txn.ignore ? 'opacity-60' : '';
          return (
            <div
              key={txn.id}
              className={`rounded-lg border bg-card p-3 ${rowOpacity} ${txn.ignore ? 'line-through' : ''}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                  {txn.description}
                </span>
                <span
                  className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${txn.amount < 0 ? 'text-destructive' : 'text-positive'}`}
                >
                  {txn.amount < 0 ? '-' : '+'}
                  {formatCurrency(txn.amount)}
                </span>
              </div>

              <div className="mb-2 flex flex-col gap-1">
                <MobileInlineCategoryCell
                  txn={txn}
                  suggestions={uniqueCategories}
                  originalCategory={originalCategoryMap.get(txn.id) ?? ''}
                  onSave={onCategoryChange}
                />
                <MobileInlineSubcategoryCell
                  txn={txn}
                  suggestions={
                    subcategoriesByCategory.get(txn.category ?? '') ?? []
                  }
                  onSave={onSubcategoryChange}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{txn.bank || '-'}</span>
                  {txn.owner && (
                    <>
                      <span className="text-[10px]">/</span>
                      <span className="font-semibold">{txn.owner}</span>
                    </>
                  )}
                  <span className="text-[10px]">/</span>
                  <span>{txn.date}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded p-1.5 transition-colors hover:bg-muted"
                    onClick={() => onNotesOpen(txn.id)}
                  >
                    <StickyNote
                      className={`size-3.5 ${(txn.notes ?? '').length > 0 ? 'text-foreground' : 'text-muted-foreground'}`}
                    />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1.5 transition-colors hover:bg-muted"
                    onClick={() => (txn.ignore ? onIgnore(txn) : onVerify(txn))}
                  >
                    {txn.ignore ? (
                      <EyeOff className="size-4 text-muted-foreground" />
                    ) : txn.verified ? (
                      <CircleCheck className="size-4 text-primary" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="rounded p-1.5 transition-colors hover:bg-muted"
                    onClick={() => onIgnore(txn)}
                  >
                    <EyeOff
                      className={`size-3.5 ${txn.ignore ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows</span>
          <Select
            value={pageSize}
            onValueChange={(val) => {
              setPageSize(val as number);
              setPage(0);
            }}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
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
